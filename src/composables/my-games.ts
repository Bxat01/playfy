import { createGlobalState } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import type { Game } from '@/types/types';
import { randomString } from '@/utils/random-string';

const STORAGE_KEY = 'Playfy.games.v1';

function load(): Game[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    // Nothing survives a restart: a game marked "running" in yesterday's
    // session is not actually running now, and leaving the flag on made the
    // Play button read "Stop" on a cold start.
    return (JSON.parse(raw) as Game[]).map((game) => ({
      ...game,
      is_running: false,
      executables: (game.executables ?? []).map((exe) => ({ ...exe, is_running: false })),
    }));
  } catch {
    return [];
  }
}

/**
 * The user's library lives outside Home so the Settings page and the global
 * shortcuts can clear it without relying on the page being mounted.
 */
export const useMyGames = createGlobalState(() => {
  const games = ref<Game[]>(load());
  const selectedId = ref<string | null>(null);

  watch(
    games,
    () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(games.value));
      } catch {
        /* storage unavailable — the list simply lives for this session */
      }
    },
    { deep: true },
  );

  const selected = computed(() => games.value.find((game) => game.uid === selectedId.value) ?? null);

  function add(game: Game) {
    if (games.value.some((entry) => entry.id === game.id)) return games.value.find((entry) => entry.id === game.id) ?? null;
    const entry: Game = { uid: randomString(), ...game };
    games.value.push(entry);
    selectedId.value = entry.uid ?? null;
    return entry;
  }

  function remove(game: Game) {
    games.value = games.value.filter((entry) => entry.uid !== game.uid);
    if (selectedId.value === game.uid) selectedId.value = games.value[0]?.uid ?? null;
  }

  function clear() {
    games.value = [];
    selectedId.value = null;
  }

  function pickFirst() {
    if (!selectedId.value && games.value.length > 0) {
      selectedId.value = games.value[0].uid ?? null;
    }
  }

  return { games, selectedId, selected, add, remove, clear, pickFirst };
});
