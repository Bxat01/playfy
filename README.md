# Playfy

**Playfy runs the visible session window under the selected game's executable name and keeps it separate from the main Playfy app.**

![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat&logo=tauri&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3-42B883?style=flat&logo=vue.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-stable-000000?style=flat&logo=rust&logoColor=white)
![C%23](https://img.shields.io/badge/C%23-.NET%20Framework-512BD4?style=flat&logo=dotnet&logoColor=white)
![Windows](https://img.shields.io/badge/Platform-Windows-0078D6?style=flat&logo=windows&logoColor=white)

## What Playfy does

Playfy is a Windows desktop app for creating a session process from Discord's selected executable entry. The visible session-card app is copied under that executable name and launched as its own process. This matches the old project's key behavior: the named process owns a visible game-titled window. Playfy does not launch or emulate the actual game, and Discord detection or Quest credit can vary.

The main Playfy window always keeps the Playfy icon in the taskbar. Only the session card uses the game icon.

## Play and Test RPC are different

- **Play** launches the visible session app under the selected executable name. It does not launch the actual game and sends no Rich Presence. The session process remains active when its window is hidden to the tray.
- **Test RPC** sends a Rich Presence preview for the selected app ID and does **not** launch a game process. It is separate from Play and cannot satisfy a requirement that checks for a running game executable.

The Test RPC button uses neutral styling so it never looks like the primary Play action. Stop a Play session, or stop the queue, before starting another session.

## Session card

Every Play session, including each queue rotation entry, opens the same standalone card process:

- Artwork, game title, app ID and elapsed time.
- Taskbar and Alt-Tab identity use the game icon.
- The card is a normal window. It does not stay above other applications.
- The **X** button hides the card to the notification area and shows a Windows notification. The named session process keeps running.
- The card's own minimised state and tray menu are separate from Playfy's main window.
- To end the session process, use **Stop** in Playfy or stop the queue. Closing the card is not a stop action.

## Queue rotation

Add games to the queue, set an interval, and Playfy rotates the session host and card from game to game. Each transition closes the previous host/card before opening the next one so two games are not reported at once.

- Drag the grip handle to reorder queue entries.
- Pause and resume without losing the current elapsed time.
- Loop or stop at the end of the queue.
- Every queued game gets the full session card.
- Starting a queue while a Home session is running is blocked until that session is stopped.

## Other features

- Search Discord's detectable-game catalogue, with a bundled list as an offline fallback.
- Save games to **My Games** and add them to the queue from the library or the catalogue.
- Native executable discovery for Windows, Linux and macOS entries in Discord's catalogue.
- Appearance controls: Onyx, Dark and Ash palettes; a blue accent and accent presets; classic panels or glass; a curated wallpaper gallery; font choices.
- English, Russian, Hindi, Chinese and Arabic dictionaries, including right-to-left Arabic layout.
- Rebindable global shortcuts matched by physical key.
- Built-in console drawer with the latest session and rotation logs.
- Data controls for clearing the games library, queue, or all cached data, with confirmation dialogs.
- Version **25.10.8**.

## Requirements

- Windows 10 or Windows 11 (the native detection path is Windows-first).
- [Node.js](https://nodejs.org/) LTS and [pnpm](https://pnpm.io/).
- [Rust](https://rustup.rs/).
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) for the native host.
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
- .NET Framework 4.x, which ships with supported Windows versions, to build and run the session card.

## Development

```bash
pnpm install
pnpm build:runner:win
pnpm tauri dev
```

`pnpm build:runner:win` builds both native helpers:

- `src-tauri/resources/game-host.exe` - the tiny Win32 game process.
- `src-tauri/resources/playfy-session.exe` - the standalone C# session card.

The frontend-only development server is available with `pnpm dev`. The Rust app is launched with `pnpm tauri dev`.

## Production build

```bash
pnpm build:runner:win
pnpm tauri build
```

Build output is written under `src-tauri/target/release/bundle/`.

## Project structure

```text
playfy/
  src/                       Vue 3 frontend
    components/              Shell, titlebar, console, game artwork and controls
    composables/             Queue, RPC, catalogue, settings, shortcuts, i18n
    pages/                   Home, Queue and Settings views
    theme/                   Tailwind theme and appearance tokens
    types/                   Shared TypeScript types
  src-tauri/                 Tauri and Rust backend
    src/lib.rs               Native host and session-card spawning
    src/rpc.rs               Discord Rich Presence client
    src/runner.rs            Activity payload construction
    resources/               Built native helpers and app resources
  src-win/                   Native Win32 game host
  src-win-cs/                Standalone C# session card
  src-linux/                 Linux session runner
  src-darwin/                macOS session runner
  scripts/                   Build and maintenance scripts
```

## A note on the project's origin

Playfy started from the public **Discord Quest Completer** project, but the current app is a substantial rewrite: the detection path moved from a single runner to a native host plus a separate session card, the queue and session lifecycle were rebuilt, and the interface and visual identity were replaced.

The original MIT notice is preserved in [LICENSE](LICENSE), and the base-project attribution is documented in [CREDITS.md](CREDITS.md). Playfy is maintained by [Bxat01](https://github.com/Bxat01).

## Disclaimer

Playfy is not affiliated with, endorsed by, or sponsored by Discord Inc. or any game publisher. Discord's detection behaviour can change at any time. Use the app responsibly and follow Discord's Terms of Service and the rules of any game you launch.

## License

[MIT](LICENSE) - original work copyright (c) 2025 Mark Terence Tiglao; modifications copyright (c) 2025-2026 Bxat01.
