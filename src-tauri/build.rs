use std::path::PathBuf;

fn main() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();

    tauri_build::build();

    // Re-run the build when the platform-specific session runner changes.
    let resources = PathBuf::from("resources");
    let mut watched = Vec::new();
    match target_os.as_str() {
        "windows" => {
            watched.push(resources.join("playfy-session.exe"));
        }
        "linux" => watched.push(resources.join("src-linux")),
        "macos" => watched.push(resources.join("src-darwin")),
        _ => return,
    }

    for resource_path in watched {
        if resource_path.exists() {
            println!("cargo:rerun-if-changed={}", resource_path.display());
        } else {
            eprintln!(
                "Warning: native resource not found at {}",
                resource_path.display()
            );
            eprintln!("Run the matching build:runner script before building Playfy.");
        }
    }
}
