use once_cell::sync::OnceCell;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use crate::{rpc, runner};

// Global static instance of the Discord client
static DISCORD_CLIENT: OnceCell<Mutex<Option<rpc::Client>>> = OnceCell::new();

fn get_discord_client() -> &'static Mutex<Option<rpc::Client>> {
    DISCORD_CLIENT.get_or_init(|| Mutex::new(None))
}

// Handle of the connect currently in flight, so a new connect (or a disconnect
// request) can abort it instead of racing against it.
static PENDING_TASK: Mutex<Option<tauri::async_runtime::JoinHandle<()>>> = Mutex::new(None);

/// Disconnects the live Discord client and cancels a connect that is still in
/// flight. Awaiting this command is important before opening the next session:
/// a fire-and-forget event could otherwise close the new connection.
#[tauri::command(rename_all = "snake_case")]
pub async fn disconnect_discord_rpc() {
    if let Ok(mut pending) = PENDING_TASK.lock() {
        if let Some(task) = pending.take() {
            task.abort();
        }
    }

    let client_option = get_discord_client()
        .lock()
        .ok()
        .and_then(|mut client_guard| client_guard.take());

    if let Some(client) = client_option {
        // Clear first, then drop the pipe. Discord records a clean session end
        // more reliably than an RPC connection that simply disappears.
        if let Err(e) = client.discord.clear_activity().await {
            eprintln!("Failed to clear activity: {}", e);
        }
        client.discord.disconnect().await;
        println!("Disconnected from Discord RPC");
    }
}

/// Usage: Calling from JS:
/// ```javascript
/// await invoke('connect_to_discord_rpc_3', { activityJson: json });
/// ```
#[tauri::command(rename_all = "snake_case")]
pub fn connect_to_discord_rpc_3(handle: AppHandle, activity_json: String) {
    let activity = match runner::parse_activity_json(&activity_json) {
        Ok(activity) => activity,
        Err(e) => {
            let _ = handle.emit("client_error", format!("invalid activity payload: {}", e));
            return;
        }
    };

    let connecting_payload = serde_json::json!({
        "app_id": activity.app_id,
    });

    // Take any client left over from a previous connect out before opening a new one
    let stale_client = get_discord_client()
        .lock()
        .ok()
        .and_then(|mut client_guard| client_guard.take());

    let task = tauri::async_runtime::spawn(async move {
        if let Some(client) = stale_client {
            // End the outgoing session properly (clear then drop) so Discord
            // files it in the activity history instead of leaking it.
            if let Err(e) = client.discord.clear_activity().await {
                eprintln!("Failed to clear activity: {}", e);
            }
            client.discord.disconnect().await;
        }

        handle
            .emit("client_connecting", connecting_payload)
            .unwrap_or_else(|e| eprintln!("Failed to emit event: {}", e));

        // Discord not running / handshake refused: report it, don't panic the app.
        let client = match runner::set_activity(activity_json).await {
            Ok(client) => client,
            Err(e) => {
                eprintln!("Failed to set activity: {}", e);
                let _ = handle.emit("client_error", format!("discord rpc: {}", e));
                return;
            }
        };

        {
            if let Ok(mut client_guard) = get_discord_client().lock() {
                *client_guard = Some(client);
            }
        }

        let connected_payload = serde_json::json!({
            "app_id": activity.app_id,
        });

        handle
            .emit("client_connected", connected_payload)
            .unwrap_or_else(|e| {
                eprintln!("Failed to emit event: {}", e);
            });
    });

    if let Ok(mut pending) = PENDING_TASK.lock() {
        if let Some(previous) = pending.take() {
            previous.abort();
        }
        *pending = Some(task);
    }
}
