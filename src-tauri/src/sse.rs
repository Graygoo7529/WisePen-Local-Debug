use crate::error::{CmdError, CmdResult};
use crate::http::CLIENT;
use futures_util::StreamExt;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use tauri::ipc::Channel;

/// 推送给前端的流帧。
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StreamFrame {
    /// 收到响应头。
    Meta { status: u16 },
    /// 一个完整的 SSE 事件（data 负载已解析为 JSON）。
    Event { data: Value, raw: String },
    /// 流正常结束（收到 [DONE] 或连接关闭）。
    Done,
    /// 流失败（HTTP 错误或服务端 error 帧由 Event 承载，这里只表示传输层错误）。
    Error { message: String },
}

static ABORT_FLAGS: LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// 请求中断指定对话流。
#[tauri::command]
pub fn abort_chat(request_id: String) {
    if let Some(flag) = ABORT_FLAGS.lock().unwrap().get(&request_id) {
        flag.store(true, Ordering::Relaxed);
    }
}

/// 发起 GET/POST SSE 请求并把事件逐帧推给前端 Channel。
#[tauri::command]
pub async fn chat_stream(
    request_id: String,
    method: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Option<Value>,
    on_event: Channel<StreamFrame>,
) -> CmdResult<()> {
    let method = method
        .parse::<reqwest::Method>()
        .map_err(|_| CmdError::from(format!("不支持的 SSE HTTP 方法: {method}")))?;
    let flag = Arc::new(AtomicBool::new(false));
    ABORT_FLAGS
        .lock()
        .unwrap()
        .insert(request_id.clone(), flag.clone());

    let result = run_stream(method, &url, headers, body.as_ref(), &on_event, &flag).await;

    ABORT_FLAGS.lock().unwrap().remove(&request_id);
    result
}

async fn run_stream(
    method: reqwest::Method,
    url: &str,
    headers: Option<HashMap<String, String>>,
    body: Option<&Value>,
    on_event: &Channel<StreamFrame>,
    abort: &AtomicBool,
) -> CmdResult<()> {
    let mut req = CLIENT
        .request(method, url)
        .header(reqwest::header::ACCEPT, "text/event-stream");
    if let Some(headers) = headers {
        for (k, v) in headers {
            req = req.header(k, v);
        }
    }
    if let Some(body) = body {
        req = req.json(body);
    }

    let resp = req.send().await?;
    let status = resp.status().as_u16();
    let _ = on_event.send(StreamFrame::Meta { status });

    let is_event_stream = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.to_ascii_lowercase().contains("text/event-stream"));
    if status >= 400 || !is_event_stream {
        let text = resp.text().await.unwrap_or_default();
        let _ = on_event.send(StreamFrame::Error {
            message: if status >= 400 {
                format!("HTTP {status}: {text}")
            } else {
                format!("SSE 端点返回了非流式响应: {text}")
            },
        });
        return Ok(());
    }

    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::with_capacity(16 * 1024);
    let mut saw_done = false;

    'stream: while let Some(chunk) = stream.next().await {
        if abort.load(Ordering::Relaxed) {
            break;
        }
        let chunk = chunk?;
        buf.extend_from_slice(&chunk);
        while let Some((end, sep_len)) = find_frame_end(&buf) {
            let frame: Vec<u8> = buf.drain(..end + sep_len).collect();
            if dispatch_frame(&frame, on_event) {
                saw_done = true;
                break 'stream;
            }
        }
    }

    // 连接关闭时冲刷残余半帧（容错）。
    if !saw_done && !buf.is_empty() && !abort.load(Ordering::Relaxed) {
        let frame = std::mem::take(&mut buf);
        saw_done = dispatch_frame(&frame, on_event);
    }

    if saw_done || abort.load(Ordering::Relaxed) {
        let _ = on_event.send(StreamFrame::Done);
    } else {
        let _ = on_event.send(StreamFrame::Error {
            message: "SSE 连接在 [DONE] 前关闭，可刷新会话重连".to_string(),
        });
    }
    Ok(())
}

/// 查找 SSE 帧边界（\n\n 或 \r\n\r\n），返回 (帧结束位置, 分隔符长度)。
fn find_frame_end(buf: &[u8]) -> Option<(usize, usize)> {
    let mut best: Option<(usize, usize)> = None;
    for (sep, sep_len) in [(b"\n\n".as_slice(), 2), (b"\r\n\r\n".as_slice(), 4)] {
        if let Some(pos) = buf
            .windows(sep_len)
            .position(|w| w == sep)
            .map(|p| p + sep_len)
        {
            let candidate = (pos - sep_len, sep_len);
            if best.is_none_or(|(e, _)| candidate.0 < e) {
                best = Some(candidate);
            }
        }
    }
    best
}

/// 解析并分发一个 SSE 帧；返回 true 表示收到 [DONE]。
fn dispatch_frame(frame: &[u8], on_event: &Channel<StreamFrame>) -> bool {
    let text = String::from_utf8_lossy(frame);
    let raw = text.trim_end().to_string();

    let mut data_lines: Vec<&str> = Vec::new();
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("data:") {
            data_lines.push(rest.strip_prefix(' ').unwrap_or(rest));
        }
        // event:/id:/retry:/注释行忽略——UIMessage Stream 不使用
    }
    if data_lines.is_empty() {
        return false;
    }
    let payload = data_lines.join("\n");
    if payload.trim() == "[DONE]" {
        return true;
    }

    match serde_json::from_str::<Value>(&payload) {
        Ok(data) => {
            let _ = on_event.send(StreamFrame::Event { data, raw });
        }
        Err(_) => {
            let _ = on_event.send(StreamFrame::Event {
                data: serde_json::json!({ "type": "_unparsed", "payload": payload }),
                raw,
            });
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_end_lf() {
        let buf = b"data: {\"a\":1}\n\ndata: x";
        // "data: {\"a\":1}" 共 13 字节，帧结束于索引 13，分隔符 2 字节
        assert_eq!(find_frame_end(buf), Some((13, 2)));
    }

    #[test]
    fn frame_end_crlf() {
        let buf = b"data: a\r\n\r\nnext";
        assert_eq!(find_frame_end(buf), Some((7, 4)));
    }

    #[test]
    fn frame_end_none() {
        assert_eq!(find_frame_end(b"data: partial\n"), None);
    }
}
