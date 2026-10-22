
export interface GameExecutable {
  is_launcher: boolean;
  name: string;
  os: string;
  filename?: string;
  path?: string;
  segments?: number;
  is_running?: boolean;
  is_installed?: boolean;
  /** PID of the visible session process launched under this executable name. */
  pid?: number;
  /** Reserved for older builds that used a separate card process. */
  uiPid?: number;
}

/** Returned by run_background_process. Windows uses game_pid for the visible session app. */
export interface SessionPids {
  game_pid: number;
  ui_pid: number;
}

/** Third-party store listing for a game — Discord ships these alongside its own id. */
export interface GameSku {
  distributor?: string;
  id: string;
}

export interface Game {
    uid?: string;
    id: string;
    name: string;
    executables: GameExecutable[];
    aliases?: string[];
    themes?: string[];
    is_running?: boolean;
    is_installed?: boolean;
    /** artwork hashes straight from Discord's detectable list */
    icon_hash?: string;
    cover_image_hash?: string;
    third_party_skus?: GameSku[];
}

export interface GameActionsProvider {
  canPlayGame: (game: Game | null) => boolean;
  isGameInstalled: (game: Game | null) => boolean;
  isExecutableRunning: (executable: GameExecutable) => boolean;
  isGameExecutableInstalled: (executable: GameExecutable) => boolean;
}
