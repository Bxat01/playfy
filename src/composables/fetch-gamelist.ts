import { type Game } from '@/types/types';
import { createGlobalState, tryOnMounted, useAsyncState } from '@vueuse/core';
import { ref } from 'vue';
import { message } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useGlobalState } from './app-state';

// One shared catalogue per app session. The bundled list is loaded first so
// every page is usable immediately; the live Discord catalogue then replaces it
// in the background when the network request succeeds.
export const useFetchGameList = createGlobalState(() => {
  const { addLog } = useGlobalState();

  async function fetchGameListFromDiscord() {
    addLog('info', 'Fetching game list from Discord...');
    const response = await invoke<string>('fetch_gamelist_from_discord');
    const parsed: unknown = JSON.parse(response);
    return Array.isArray(parsed) ? (parsed as Game[]) : undefined;
  }

  const {
    state: gameListFromDiscord,
    isReady: isReadyDiscord,
    execute: executeDiscord,
    isLoading: isLoadingDiscord,
  } = useAsyncState<Game[] | unknown[] | undefined>(fetchGameListFromDiscord, [], {
    immediate: false,
    resetOnExecute: true,
  });

  const {
    state: bundledGameList,
    isReady: isReadyBundled,
    execute: executeBundled,
    isLoading: isLoadingBundled,
  } = useAsyncState(
    () => {
      addLog('info', 'Loading the bundled game list...');
      return import('../assets/gamelist.json').then((result) => result.default);
    },
    [],
    {
      immediate: false,
      resetOnExecute: true,
    },
  );

  const fetchError = ref<string | null>(null);
  const gameDB = ref<Game[]>([]);

  function isValidGameList(data: unknown): data is Game[] {
    return (
      Array.isArray(data) &&
      data.length > 0 &&
      data[0] &&
      'aliases' in data[0] &&
      'name' in data[0] &&
      'executables' in data[0]
    );
  }

  async function fetchGameList() {
    fetchError.value = null;
    addLog('info', 'Refreshing the game catalogue...');

    // Prefer the current catalogue. Loading the bundled copy can parse over
    // ten megabytes, so keep it as an offline fallback instead of startup work.
    try {
      await executeDiscord();
    } catch {
      addLog('warn', 'Discord catalogue is unavailable.');
    }
    if (isValidGameList(gameListFromDiscord.value)) {
      gameDB.value = gameListFromDiscord.value;
      addLog('info', `Loaded ${gameDB.value.length} games from Discord.`);
      return;
    }

    // The local list is only parsed after the request fails or returns bad data.
    try {
      await executeBundled();
    } catch {
      addLog('error', 'Could not load the bundled game list.');
    }
    if (isValidGameList(bundledGameList.value)) {
      gameDB.value = bundledGameList.value;
      addLog('info', `Loaded ${gameDB.value.length} games from the offline catalogue.`);
    }

    if (!gameDB.value.length) {
      fetchError.value = 'No game catalogue source could be loaded.';
      addLog('error', fetchError.value);
      await message(fetchError.value, {
        title: 'Game list unavailable',
        kind: 'error',
        buttons: { ok: 'OK' },
      });
    }
  }

  tryOnMounted(async () => {
    await fetchGameList();
  });

  return {
    gameListFromDiscord,
    bundledGameList,
    fetchError,
    isReadyDiscord,
    isReadyBundled,
    gameDB,
    fetchGameList,
    isLoadingDiscord,
    isLoadingBundled,
  };
});
