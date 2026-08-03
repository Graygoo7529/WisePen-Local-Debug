use serde::Serialize;
use std::fmt;

/// 命令错误：序列化后传给前端，保持 { message } 形状。
#[derive(Debug)]
pub struct CmdError {
    pub message: String,
}

impl fmt::Display for CmdError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl Serialize for CmdError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.message)
    }
}

impl From<String> for CmdError {
    fn from(message: String) -> Self {
        Self { message }
    }
}

impl From<&str> for CmdError {
    fn from(message: &str) -> Self {
        Self {
            message: message.to_string(),
        }
    }
}

impl From<reqwest::Error> for CmdError {
    fn from(e: reqwest::Error) -> Self {
        Self {
            message: format!("网络请求失败: {e}"),
        }
    }
}

impl From<std::io::Error> for CmdError {
    fn from(e: std::io::Error) -> Self {
        Self {
            message: format!("文件操作失败: {e}"),
        }
    }
}

impl From<serde_json::Error> for CmdError {
    fn from(e: serde_json::Error) -> Self {
        Self {
            message: format!("JSON 处理失败: {e}"),
        }
    }
}

pub type CmdResult<T> = Result<T, CmdError>;
