import { createGlobalState } from '@vueuse/core';
import { shallowRef } from 'vue';

export const Pages = {
  HOME: 'home',
  QUEUE: 'queue',
  SETTINGS: 'settings',
} as const;

export type Pages = (typeof Pages)[keyof typeof Pages];

export interface AppLogObject {
  type: 'info' | 'error' | 'warning' | 'debug';
  message: string;
  timestamp: Date;
}

export interface LiveSession {
  gameId: string;
  name: string;
  startedAt: number;
  /** `test` sessions are Rich Presence previews, never Play sessions. */
  mode: 'play' | 'test';
}

export const useGlobalState = createGlobalState(() => {
  const page = shallowRef<Pages>(Pages.HOME);
  const logs = shallowRef<AppLogObject[]>([]);
  /** A Home-page session that is live outside the queue rotation. */
  const liveSession = shallowRef<LiveSession | null>(null);
  /** Console drawer state lives here so the shell can reserve scroll space. */
  const consoleExpanded = shallowRef(false);

  function setPage(newPage: Pages) {
    page.value = newPage;
  }

  function addLog(type: string | 'info' | 'error' | 'warning' | 'debug', newLog?: string) {
    const level = newLog ? (type as AppLogObject['type']) : 'info';
    const message = newLog ?? (type as string);
    // shallowRef only reacts to reassignment, so build a new array instead of pushing
    const entry: AppLogObject = { type: level, message, timestamp: new Date() };
    const next = logs.value.length >= 300 ? logs.value.slice(1) : logs.value.slice();
    next.push(entry);
    logs.value = next;
  }

  function clearLogs() {
    logs.value = [];
  }

  function setLiveSession(gameId: string, name: string, mode: 'play' | 'test' = 'play') {
    liveSession.value = { gameId, name, startedAt: Date.now(), mode };
  }

  function clearLiveSession() {
    liveSession.value = null;
  }

  return {
    page,
    setPage,
    logs,
    addLog,
    clearLogs,
    liveSession,
    setLiveSession,
    clearLiveSession,
    consoleExpanded,
  };
});
