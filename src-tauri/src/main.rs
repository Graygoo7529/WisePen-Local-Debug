mod error;
mod fsutil;
mod http;
mod sse;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            http::rest_request,
            http::http_get_text,
            sse::chat_stream,
            sse::abort_chat,
            fsutil::read_text_file,
            fsutil::file_stat,
            fsutil::file_md5,
            fsutil::text_md5,
            fsutil::oss_put_text,
            fsutil::oss_put_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
