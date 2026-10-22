mod app_paths;
mod catalog;
mod rpc;
mod rpc_commands;
mod runner;
mod session;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    app_paths::configure_portable_webview_data()
        .expect("could not prepare portable WebView data directory");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            session::path::create_fake_game,
            session::process::run_background_process,
            session::process::stop_process,
            storage::read_text_file,
            storage::write_text_file,
            rpc_commands::disconnect_discord_rpc,
            rpc_commands::connect_to_discord_rpc_3,
            catalog::fetch_gamelist_from_discord
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
