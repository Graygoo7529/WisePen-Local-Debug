use crate::error::{CmdError, CmdResult};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::{Duration, Instant};

/// 全应用共享的 HTTP 客户端。
pub static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .build()
        .expect("failed to build reqwest client")
});

#[derive(Serialize)]
pub struct RestResponse {
    pub status: u16,
    /// 响应体：JSON 则原样返回，否则为 {"_text": "..."} 包裹。
    pub body: Value,
    pub elapsed_ms: u128,
}

/// 通用 REST 转发：前端统一经此命令访问各后端服务，避开 WebView 的 CORS 限制。
#[tauri::command]
pub async fn rest_request(
    method: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    query: Option<HashMap<String, String>>,
    body: Option<Value>,
    timeout_secs: Option<u64>,
) -> CmdResult<RestResponse> {
    let method = method
        .parse::<reqwest::Method>()
        .map_err(|_| CmdError::from(format!("不支持的 HTTP 方法: {method}")))?;

    let mut req = CLIENT.request(method, &url);
    if let Some(headers) = headers {
        for (k, v) in headers {
            req = req.header(k, v);
        }
    }
    if let Some(query) = query {
        req = req.query(&query);
    }
    if let Some(body) = body {
        req = req.json(&body);
    }
    req = req.timeout(Duration::from_secs(timeout_secs.unwrap_or(60)));

    let started = Instant::now();
    let resp = req.send().await?;
    let status = resp.status().as_u16();
    let bytes = resp.bytes().await?;
    let elapsed_ms = started.elapsed().as_millis();

    let body = match serde_json::from_slice::<Value>(&bytes) {
        Ok(v) => v,
        Err(_) => serde_json::json!({ "_text": String::from_utf8_lossy(&bytes) }),
    };
    Ok(RestResponse {
        status,
        body,
        elapsed_ms,
    })
}
