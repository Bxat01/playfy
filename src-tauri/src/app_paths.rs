use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const PORTABLE_MARKER: &str = ".playfy-portable";

/// Returns the portable data directory when this executable is placed beside
/// the marker file. Installed builds continue using the platform app-data path.
pub fn portable_data_dir() -> Option<PathBuf> {
    let executable = std::env::current_exe().ok()?;
    let install_dir = executable.parent()?;
    install_dir
        .join(PORTABLE_MARKER)
        .is_file()
        .then(|| install_dir.join("app-data"))
}

pub fn app_data_dir(handle: &AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = portable_data_dir() {
        std::fs::create_dir_all(&path)
            .map_err(|error| format!("Could not create portable data directory: {error}"))?;
        return Ok(path);
    }

    handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate Playfy's data directory: {error}"))
}

#[cfg(windows)]
pub fn configure_portable_webview_data() -> Result<(), String> {
    let Some(data_dir) = portable_data_dir() else {
        return Ok(());
    };

    let webview_dir = data_dir.join("webview");
    std::fs::create_dir_all(&webview_dir)
        .map_err(|error| format!("Could not create portable WebView data directory: {error}"))?;

    // WebView2 reads this while Tauri creates its first webview.
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", webview_dir);
    Ok(())
}
