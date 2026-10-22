/// Reads a Playfy `.pfy` backup chosen by the user in the native file dialog.
/// The size cap mirrors the TypeScript parser so a huge file can never be
/// loaded into the WebView just to be rejected afterwards.
#[tauri::command(rename_all = "snake_case")]
pub async fn read_text_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read the backup: {}", e))?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err("This backup is too large.".to_string());
    }
    String::from_utf8(bytes).map_err(|_| "The backup is not valid UTF-8 text.".to_string())
}

/// Writes the generated `.pfy` file to the path returned by the native Save
/// dialog. Keeping file I/O in Rust avoids exposing a general filesystem API to
/// the webview and keeps the frontend independent of platform paths.
#[tauri::command(rename_all = "snake_case")]
pub async fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if contents.len() > 4 * 1024 * 1024 {
        return Err("This backup is too large.".to_string());
    }
    std::fs::write(&path, contents).map_err(|e| format!("Could not save the backup: {}", e))
}
