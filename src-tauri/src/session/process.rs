use once_cell::sync::OnceCell;
use std::collections::HashMap;
use std::fs;
use std::sync::Mutex;
use tauri::AppHandle;

use super::path::{game_folder_path, is_app_bundle, launch_executable_path};
#[cfg(not(target_os = "windows"))]
use super::path::resolve_runner_template;
#[cfg(target_os = "windows")]
use super::path::resolve_session_template;

#[derive(Clone, serde::Serialize)]
pub struct SessionPids {
    pub game_pid: u32,
    pub ui_pid: u32,
}

// Keep OS process handles for sessions created by this app. Killing by a PID
// alone can target an unrelated process if Windows has reused that PID after
// a session exited. Holding Child lets Stop terminate exactly the child we
// launched and reap its exit status.
static SESSION_CHILDREN: OnceCell<Mutex<HashMap<u32, std::process::Child>>> = OnceCell::new();

fn track_session_child(child: std::process::Child) -> Result<u32, String> {
    let pid = child.id();
    let children = SESSION_CHILDREN.get_or_init(|| Mutex::new(HashMap::new()));
    let mut children = children
        .lock()
        .map_err(|_| "Session process registry is unavailable".to_string())?;
    children.insert(pid, child);
    Ok(pid)
}

/// On Windows, the visible session-card application is copied and launched under the selected executable name. This restores the old process and visible-window behavior while keeping it separate from Playfy. On macOS/Linux the platform runner remains the visible process.
fn spawn_witness(
    handle: &AppHandle,
    name: &str,
    path: &str,
    executable_name: &str,
    app_id: &str,
    cover: Option<&str>,
    icon: Option<&str>,
    url: Option<&str>,
) -> Result<SessionPids, String> {
    if executable_name.trim().is_empty() {
        return Err("This game has no executable for the current platform".to_string());
    }

    let folder = game_folder_path(handle, path, app_id)?;
    fs::create_dir_all(&folder).map_err(|e| format!("Failed to create session directory: {}", e))?;
    let executable_path = launch_executable_path(&folder, executable_name);
    let parent_pid = std::process::id().to_string();

    if is_app_bundle(executable_name) {
        #[cfg(target_os = "macos")]
        {
            let child = std::process::Command::new(&executable_path)
                .arg("--title")
                .arg(name)
                .current_dir(&folder)
                .spawn()
                .map_err(|e| format!("Failed to start the macOS session window: {}", e))?;
            let pid = track_session_child(child)?;
            return Ok(SessionPids {
                game_pid: pid,
                ui_pid: 0,
            });
        }

        #[cfg(not(target_os = "macos"))]
        {
            return Err("App bundle launches are only supported on macOS".to_string());
        }
    }

    #[cfg(target_os = "windows")]
    {
        // The old project ran its visible Win32 window from the executable
        // name Discord expects. Keep that relationship: the polished C# card
        // is itself the process with the selected game image name. A separate
        // hidden 1x1 process was not detected consistently by Discord.
        let card_template = resolve_session_template(handle)?;
        if !card_template.exists() {
            return Err(format!(
                "Session window not found at {:?}. Reinstall Playfy or rebuild the resources.",
                card_template
            ));
        }
        fs::copy(&card_template, &executable_path)
            .map_err(|e| format!("Failed to prepare the game session executable: {}", e))?;

        let mut session = std::process::Command::new(&executable_path);
        session
            .arg("--title")
            .arg(name)
            .arg("--appid")
            .arg(app_id)
            .arg("--parent")
            .arg(&parent_pid)
            .arg("--repo")
            .arg("https://github.com/Bxat01/playfy");

        if let Some(cover) = cover.filter(|value| !value.is_empty()) {
            session.arg("--cover").arg(cover);
        }
        if let Some(icon) = icon.filter(|value| !value.is_empty()) {
            session.arg("--icon").arg(icon);
        }
        if let Some(url) = url.filter(|value| !value.is_empty()) {
            session.arg("--url").arg(url);
        }
        session.current_dir(&folder);

        let child = session
            .spawn()
            .map_err(|e| format!("Failed to open the game session window: {}", e))?;
        let pid = track_session_child(child)?;
        return Ok(SessionPids {
            game_pid: pid,
            ui_pid: 0,
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        let template = resolve_runner_template(handle)?;
        fs::copy(&template, &executable_path)
            .map_err(|e| format!("Failed to refresh the compatibility host: {}", e))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&executable_path)
                .map_err(|e| format!("Failed to get file metadata: {}", e))?
                .permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&executable_path, perms)
                .map_err(|e| format!("Failed to set executable permissions: {}", e))?;
        }

        let mut runner = std::process::Command::new(&executable_path);
        runner.arg("--title").arg(name).arg("--parent").arg(&parent_pid);
        runner.current_dir(&folder);

        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            runner.process_group(0);
        }

        let child = runner
            .spawn()
            .map_err(|e| format!("Failed to start the compatibility host: {}", e))?;
        let pid = track_session_child(child)?;
        Ok(SessionPids {
            game_pid: pid,
            ui_pid: 0,
        })
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn run_background_process(
    handle: tauri::AppHandle,
    name: &str,
    path: &str,
    executable_name: &str,
    path_len: i64,
    app_id: String,
    cover: Option<String>,
    icon: Option<String>,
    url: Option<String>,
) -> Result<SessionPids, String> {
    let _ = path_len;
    spawn_witness(
        &handle,
        name,
        path,
        executable_name,
        &app_id,
        cover.as_deref(),
        icon.as_deref(),
        url.as_deref(),
    )
}

#[tauri::command(rename_all = "snake_case")]
pub async fn stop_process(pid: u32) -> Result<(), String> {
    let children = SESSION_CHILDREN.get_or_init(|| Mutex::new(HashMap::new()));
    let mut children = children
        .lock()
        .map_err(|_| "Session process registry is unavailable".to_string())?;

    if let Some(child) = children.get_mut(&pid) {
        match child
            .try_wait()
            .map_err(|e| format!("Could not inspect session process {}: {}", pid, e))?
        {
            Some(_) => {
                children.remove(&pid);
                return Ok(());
            }
            None => {
                child
                    .kill()
                    .map_err(|e| format!("Could not stop session process {}: {}", pid, e))?;
                child
                    .wait()
                    .map_err(|e| format!("Could not confirm session process {} stopped: {}", pid, e))?;
                children.remove(&pid);
                return Ok(());
            }
        }
    }

    Err(format!(
        "Session process {} is not owned by this Playfy instance or has already been released",
        pid
    ))
}
