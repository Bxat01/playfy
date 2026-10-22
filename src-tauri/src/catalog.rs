use std::time::Duration;

#[tauri::command(rename_all = "snake_case")]
pub async fn fetch_gamelist_from_discord() -> Result<String, String> {
    let client = tauri_plugin_http::reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| format!("could not prepare catalogue request: {}", e))?;

    let response = client
        .get("https://discord.com/api/applications/detectable")
        .send()
        .await
        .map_err(|e| format!("catalogue request failed: {}", e))?
        .error_for_status()
        .map_err(|e| format!("catalogue request returned an error: {}", e))?;

    response
        .text()
        .await
        .map_err(|e| format!("could not read the game catalogue: {}", e))
}
