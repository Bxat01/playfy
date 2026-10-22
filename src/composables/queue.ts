import { createGlobalState } from '@vueuse/core';
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './rpc';
import { gameIconUrl, primaryArtUrl, storePageUrl } from './game-art';
import { decorateExecutable } from './executables';
import { useGlobalState } from './app-state';
import type { Game, SessionPids } from '@/types/types';
import { randomString } from '@/utils/random-string';
import { useSettings } from './settings';
import { getCurrentOS } from '@/constants/constants';

export interface QueueEntry {
  uid: string;
  game: Game;
}

export type LogLevel = 'info' | 'ok' | 'warn' | 'error';

export interface LogLine {
  id: number;
  at: string;
  level: LogLevel;
  message: string;
}

interface PersistedQueue {
  entries: QueueEntry[];
  intervalSec: number;
  loop: boolean;
}

const STORAGE_KEY = 'Playfy.queue.v1';
const MAX_LOG_LINES = 300;
const TICK_MS = 1000;

function loadPersisted(): PersistedQueue {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: [], intervalSec: 300, loop: true };
    const stored = JSON.parse(raw);
    return {
      entries: Array.isArray(stored.entries) ? stored.entries : [],
      intervalSec: Number(stored.intervalSec) > 0 ? Number(stored.intervalSec) : 300,
      loop: stored.loop !== false,
    };
  } catch {
    return { entries: [], intervalSec: 300, loop: true };
  }
}

/**
 * Rotation engine. Everything the UI shows about the queue — the countdown, the
 * terminal log, the "up next" card — derives from this single piece of state.
 */
export const useQueue = createGlobalState(() => {
  const { settings } = useSettings();
  const persisted = loadPersisted();

  const entries = shallowRef<QueueEntry[]>(persisted.entries);
  const intervalSec = ref(persisted.intervalSec || settings.defaultInterval);
  const loop = ref(persisted.loop);

  const running = ref(false);
  const paused = ref(false);
  const switching = ref(false);
  const index = ref(-1);
  const now = ref(Date.now());

  const entryStartedAt = ref(0);
  const pausedTotal = ref(0);
  const pauseStartedAt = ref(0);

  const logs = shallowRef<LogLine[]>([]);
  let logId = 0;
  let ticker: number | null = null;

  function log(level: LogLevel, message: string) {
    const line: LogLine = {
      id: logId++,
      at: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      level,
      message,
    };
    logs.value = logs.value.length >= MAX_LOG_LINES ? [...logs.value.slice(1), line] : [...logs.value, line];
  }

  function clearLogs() {
    logs.value = [];
  }

  /* --------------------------------------------------------- session window */

  /** The live witness process, if one is open for the queue. */
  const { liveSession } = useGlobalState();
  const witness = ref<{
    filename: string;
    path: string;
    gameId: string;
    pid: number;
    uiPid: number;
  } | null>(null);

  function pickExecutable(game: Game) {
    const candidates = (game.executables ?? [])
      .map(decorateExecutable)
      .filter((exe) => !!exe.filename && exe.path !== undefined);
    if (candidates.length === 0) return null;
    return candidates.find((exe) => exe.os === getCurrentOS()) ?? null;
  }

  /**
   * Opens the native compatibility host and separate session card for the
   * current queue entry. Test RPC remains a separate, explicit action.
   */
  async function openWitness(game: Game) {
    if (!isTauri) return;
    const exe = pickExecutable(game);
    if (!exe?.filename) {
      log('warn', `${game.name} has no executable for this platform`);
      return;
    }

    try {
      const pids = await invoke<SessionPids>('run_background_process', {
        name: game.name,
        path: exe.path ?? '',
        executable_name: exe.filename,
        path_len: exe.segments ?? 0,
        app_id: game.id,
        cover: primaryArtUrl(game) ?? '',
        icon: gameIconUrl(game) ?? '',
        url: storePageUrl(game) ?? '',
      });
      witness.value = {
        filename: exe.filename,
        path: exe.path ?? '',
        gameId: game.id,
        pid: pids.game_pid,
        uiPid: pids.ui_pid,
      };
      log('info', `Playfy compatibility host + session card running for ${game.name}`);
    } catch (error) {
      log('warn', `could not open the session: ${String(error)}`);
    }
  }

  async function closeWitness() {
    const currentWitness = witness.value;
    witness.value = null;
    if (!isTauri) return;

    if (!currentWitness) return;

    for (const pid of [currentWitness.pid, currentWitness.uiPid]) {
      if (!pid) continue;
      try {
        await invoke('stop_process', { pid });
      } catch {
        /* the process was already closed */
      }
    }
  }

  const current = computed(() => entries.value[index.value] ?? null);

  const next = computed(() => {
    if (entries.value.length === 0) return null;
    const candidate = index.value + 1;
    if (candidate >= entries.value.length) return loop.value ? entries.value[0] : null;
    return entries.value[candidate];
  });

  const elapsedSec = computed(() => {
    if (index.value < 0) return 0;
    const end = paused.value ? pauseStartedAt.value : now.value;
    return Math.max(0, (end - entryStartedAt.value - pausedTotal.value) / 1000);
  });

  const remainingSec = computed(() => Math.max(0, intervalSec.value - elapsedSec.value));

  const progress = computed(() =>
    intervalSec.value > 0 ? Math.min(1, elapsedSec.value / intervalSec.value) : 0,
  );

  /* ------------------------------------------------------------ mutation */

  function isQueued(game: Game) {
    return entries.value.some((entry) => entry.game.id === game.id);
  }

  function addToQueue(game: Game) {
    if (isQueued(game)) return false;
    entries.value = [...entries.value, { uid: randomString(), game }];
    log('info', `queued ${game.name}`);
    return true;
  }

  function removeFromQueue(entry: QueueEntry) {
    const position = entries.value.findIndex((e) => e.uid === entry.uid);
    if (position === -1) return;
    entries.value = entries.value.filter((e) => e.uid !== entry.uid);
    log('info', `removed ${entry.game.name} from queue`);

    if (position === index.value) {
      // the game currently on air got removed - rotate onto the next one
      if (entries.value.length === 0) stop();
      else void switchTo(position % entries.value.length, 'rotate');
    } else if (position < index.value) {
      index.value--;
    }
  }

  function clearQueue() {
    entries.value = [];
    void stop();
    log('info', 'queue cleared');
  }

  function moveEntry(entry: QueueEntry, direction: -1 | 1) {
    const list = [...entries.value];
    const position = list.findIndex((e) => e.uid === entry.uid);
    const target = position + direction;
    if (position === -1 || target < 0 || target >= list.length) return;
    [list[position], list[target]] = [list[target], list[position]];
    entries.value = list;
    if (running.value) {
      if (index.value === position) index.value = target;
      else if (index.value === target) index.value = position;
    }
  }

  /** Drag-and-drop reposition. `slot` is an insertion position in the list
   * AS SEEN BEFORE removal (0 = front, length = back), so "drop after row r"
   * lands exactly after row r even though splicing shifts the indexes. */
  function moveEntryTo(entry: QueueEntry, slot: number) {
    const list = [...entries.value];
    const from = list.findIndex((e) => e.uid === entry.uid);
    if (from === -1) return;
    // resolve the slot against the list with `from` taken out
    const to = Math.max(0, Math.min(list.length - 1, slot > from ? slot - 1 : slot));
    if (to === from) return;
    list.splice(to, 0, list.splice(from, 1)[0]);
    entries.value = list;
    if (running.value) {
      if (index.value === from) index.value = to;
      else if (from < index.value && to >= index.value) index.value--;
      else if (from > index.value && to <= index.value) index.value++;
    }
    log('info', `moved ${entry.game.name} to position ${to + 1}`);
  }

  /* -------------------------------------------------------------- engine */

  function ensureTicker() {
    if (ticker !== null) return;
    ticker = window.setInterval(() => {
      now.value = Date.now();
      if (running.value && !paused.value && !switching.value && remainingSec.value <= 0) {
        void rotate();
      }
    }, TICK_MS);
  }

  function clearTicker() {
    if (ticker !== null) {
      window.clearInterval(ticker);
      ticker = null;
    }
  }

  async function switchTo(position: number, reason: 'start' | 'rotate' | 'jump') {
    const entry = entries.value[position];
    if (!entry || switching.value) return;

    switching.value = true;
    try {
      // The previous entry's processes must go before the next one opens, or
      // Discord would see two games running at once.
      await closeWitness();
      index.value = position;
      entryStartedAt.value = Date.now();
      pausedTotal.value = 0;
      now.value = Date.now();
      await openWitness(entry.game);
      const nextLabel = next.value?.game.name ?? '-';
      log('ok', `${reason === 'jump' ? 'jumped to' : 'playing'} ${entry.game.name} (${position + 1}/${entries.value.length}) - every ${intervalSec.value}s - next: ${nextLabel}`);
    } catch (error) {
      log('error', `failed to switch session: ${String(error)}`);
    } finally {
      switching.value = false;
    }
  }

  async function rotate() {
    if (entries.value.length === 0) return;
    let target = index.value + 1;
    if (target >= entries.value.length) {
      if (!loop.value) {
        log('ok', 'end of queue reached - rotation stopped');
        await stop();
        return;
      }
      target = 0;
      log('info', 'queue wrapped around to the first game');
    }
    await switchTo(target, 'rotate');
  }

  async function start() {
    if (running.value) return;
    if (entries.value.length === 0) {
      log('warn', 'queue is empty - add a few games first');
      return;
    }
    if (liveSession.value) {
      log('warn', 'stop the current Home session before starting the queue');
      return;
    }

    running.value = true;
    paused.value = false;
    ensureTicker();
    log('info', `rotation started - ${entries.value.length} games - ${intervalSec.value}s per game - loop ${loop.value ? 'on' : 'off'}`);
    await switchTo(0, 'start');
  }

  async function stop() {
    if (running.value) log('info', 'rotation stopped');
    running.value = false;
    paused.value = false;
    index.value = -1;
    await closeWitness();
  }

  function pause() {
    if (!running.value || paused.value) return;
    paused.value = true;
    pauseStartedAt.value = Date.now();
    log('info', `paused at ${Math.round(elapsedSec.value)}s`);
  }

  function resume() {
    if (!running.value || !paused.value) return;
    pausedTotal.value += Date.now() - pauseStartedAt.value;
    paused.value = false;
    log('info', 'resumed');
  }

  async function jumpTo(position: number) {
    if (!running.value) return;
    if (paused.value) {
      pausedTotal.value = 0;
      paused.value = false;
    }
    await switchTo(position, 'jump');
  }

  function setIntervalSeconds(value: number) {
    const clamped = Math.min(86400, Math.max(15, Math.round(value)));
    intervalSec.value = clamped;
    if (running.value && !paused.value) {
      // give the current game a full window with the new interval
      entryStartedAt.value = Date.now();
      pausedTotal.value = 0;
      log('info', `interval set to ${clamped}s`);
    }
  }

  watch(
    [entries, intervalSec, loop],
    () => {
      const payload: PersistedQueue = {
        entries: entries.value,
        intervalSec: intervalSec.value,
        loop: loop.value,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        /* keep the queue in memory when storage is unavailable */
      }
    },
    { deep: true },
  );

  // keep the interval in sync with the user's default the first time round
  if (!localStorage.getItem(STORAGE_KEY)) intervalSec.value = settings.defaultInterval;

  return reactive({
    entries,
    intervalSec,
    loop,
    running,
    paused,
    switching,
    index,
    current,
    next,
    elapsedSec,
    remainingSec,
    progress,
    logs,
    log,
    clearLogs,
    isQueued,
    addToQueue,
    removeFromQueue,
    clearQueue,
    moveEntry,
    moveEntryTo,
    start,
    stop,
    pause,
    resume,
    jumpTo,
    setIntervalSeconds,
  });
});
