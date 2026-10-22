import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Game } from '@/types/types';

/** True when running inside the real desktop shell (false in a plain browser). */
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface PresencePayload {
  details?: string;
  state?: string;
  /** epoch seconds; Discord renders it as the "elapsed" counter */
  timestamp?: number;
}

/**
 * Pushes a "Playing <game>" activity through the Rust backend. Switching games
 * is just another connect: the backend replaces the live client transparently.
 */
export async function connectPresence(game: Game, payload: PresencePayload = {}): Promise<void> {
  if (!isTauri) throw new Error('Tauri runtime is not available');
  await invoke('connect_to_discord_rpc_3', {
    activity_json: JSON.stringify({
      app_id: game.id,
      details: payload.details ?? game.name,
      state: payload.state ?? '',
      timestamp: payload.timestamp ?? Math.floor(Date.now() / 1000),
      activity_kind: 0,
    }),
  });
}

export async function disconnectPresence(): Promise<void> {
  if (!isTauri) throw new Error('Tauri runtime is not available');
  await invoke('disconnect_discord_rpc');
}

/** Fired by the backend when Discord refuses the connection. */
export function onPresenceError(handler: (message: string) => void) {
  if (!isTauri) return () => {};
  let unlisten: (() => void) | null = null;
  let disposed = false;
  listen<string>('client_error', (event) => handler(event.payload)).then((fn) => {
    if (disposed) fn();
    else unlisten = fn;
  });
  return () => {
    disposed = true;
    unlisten?.();
  };
}

