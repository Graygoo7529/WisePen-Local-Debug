use crate::error::{CmdError, CmdResult};
use crate::http::CLIENT;
use serde::Serialize;
use std::io::Read;

/// 读取文本文件（UTF-8 有损转换），默认上限 4 MB。
#[tauri::command]
pub fn read_text_file(path: String, max_bytes: Option<u64>) -> CmdResult<String> {
    let max = max_bytes.unwrap_or(4 * 1024 * 1024);
    let meta = std::fs::metadata(&path)?;
    if meta.len() > max {
        return Err(CmdError::from(format!(
            "文件过大（{} 字节，上限 {} 字节）",
            meta.len(),
            max
        )));
    }
    let bytes = std::fs::read(&path)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[derive(Serialize)]
pub struct FileStat {
    pub size: u64,
    pub file_name: String,
}

/// 获取文件大小与文件名（附件初始化上传前需要）。
#[tauri::command]
pub fn file_stat(path: String) -> CmdResult<FileStat> {
    let meta = std::fs::metadata(&path)?;
    let file_name = std::path::Path::new(&path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(FileStat {
        size: meta.len(),
        file_name,
    })
}

/// 计算文件 MD5（32 位小写十六进制），分块读取避免大文件占内存。
#[tauri::command]
pub fn file_md5(path: String) -> CmdResult<String> {
    let mut file = std::fs::File::open(&path)?;
    let mut ctx = md5::Context::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        ctx.consume(&buf[..n]);
    }
    Ok(format!("{:x}", ctx.compute()))
}

/// 计算文本内容的 MD5（32 位小写十六进制），用于 Skill/Agent 资产上传初始化。
#[tauri::command]
pub fn text_md5(content: String) -> String {
    let mut ctx = md5::Context::new();
    ctx.consume(content.as_bytes());
    format!("{:x}", ctx.compute())
}

#[derive(Serialize)]
pub struct OssPutResult {
    pub status: u16,
    pub body: String,
}

/// 以预签名 URL 上传文本内容（如 Skill 资产）到 OSS。
#[tauri::command]
pub async fn oss_put_text(
    put_url: String,
    callback_header: Option<String>,
    content: String,
) -> CmdResult<OssPutResult> {
    oss_put(put_url, callback_header, content.into_bytes()).await
}

/// 以预签名 URL 上传本地文件到 OSS。
#[tauri::command]
pub async fn oss_put_file(
    put_url: String,
    callback_header: Option<String>,
    path: String,
) -> CmdResult<OssPutResult> {
    let bytes = tokio::fs::read(&path).await?;
    oss_put(put_url, callback_header, bytes).await
}

async fn oss_put(
    put_url: String,
    callback_header: Option<String>,
    bytes: Vec<u8>,
) -> CmdResult<OssPutResult> {
    let mut req = CLIENT
        .put(&put_url)
        .header(reqwest::header::CONTENT_TYPE, "application/octet-stream")
        .body(bytes);
    if let Some(cb) = callback_header.filter(|s| !s.is_empty()) {
        req = req.header("x-oss-callback", cb);
    }
    let resp = req.send().await?;
    let status = resp.status().as_u16();
    let body = resp.text().await.unwrap_or_default();
    Ok(OssPutResult { status, body })
}
