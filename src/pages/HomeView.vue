<script setup lang="ts">
import { computed, provide, ref, shallowRef, watch } from 'vue';
import { onClickOutside, refDebounced, tryOnMounted } from '@vueuse/core';
import { invoke } from '@tauri-apps/api/core';
import GameArt from '@/components/GameArt.vue';
import GameExecutables from '@/components/GameExecutables.vue';
import Icon from '@/components/ui/Icon.vue';
import SearchBar from '@/components/SearchBar.vue';
import { GameActionsKey, getCurrentOS } from '@/constants/constants';
import { useFetchGameList } from '@/composables/fetch-gamelist';
import { openContextMenu, type ContextMenuItem } from '@/composables/context-menu';
import { useGlobalState } from '@/composables/app-state';
import { useI18n } from '@/composables/i18n';
import { useQueue } from '@/composables/queue';
import { connectPresence, disconnectPresence } from '@/composables/rpc';
import { primaryArtUrl, gameIconUrl, storePageUrl } from '@/composables/game-art';
import { useMyGames } from '@/composables/my-games';
import type { Game, GameActionsProvider, GameExecutable, SessionPids } from '@/types/types';

const { gameDB, isLoadingBundled, isLoadingDiscord, fetchGameList } = useFetchGameList();
const { setLiveSession, clearLiveSession, liveSession } = useGlobalState();
const { t } = useI18n();
const queue = useQueue();

/* --------------------------------------------------------------- search */

const COPYRIGHT = '\u00A9';
const TRADEMARK = '\u2122';
const REGISTERED = '\u00AE';
const ignoredSymbols = new RegExp(`[${COPYRIGHT}${TRADEMARK}${REGISTERED}]`, 'g');

/** Strips ©/™/® so "Rocket League©" still matches a plain "rocket league". */
function normalize(text: string) {
  return text.replace(ignoredSymbols, '').toLowerCase();
}

const searchQuery = shallowRef('');
const debouncedQuery = refDebounced(searchQuery, 120);

// A plain scan over the catalog instead of a prebuilt fuzzy index: indexing
// the ~24k entries blocked the main thread for seconds every time this page
// mounted, which made switching to Home feel broken. Scanning names is a
// couple of milliseconds, so navigation stays instant.
const searchResults = computed(() => {
  const query = normalize(debouncedQuery.value.trim());
  if (query.length < 2) return [];
  const starts: Game[] = [];
  const contains: Game[] = [];
  for (const game of gameDB.value) {
    const name = normalize(game.name);
    if (name.startsWith(query)) {
      if (starts.length < 14) starts.push(game);
      continue;
    }
    const matches =
      name.includes(query) ||
      normalize(game.id).includes(query) ||
      (game.aliases?.some((alias) => normalize(alias).includes(query)) ?? false);
    if (matches && contains.length < 14) contains.push(game);
    if (starts.length >= 14 && contains.length >= 14) break;
  }
  return [...starts, ...contains].slice(0, 14);
});

function onSearch(query: string) {
  searchQuery.value = query;
}

/* ---------------------------------------------------------- my games list */

const {
  games: gameList,
  selectedId: selectedGameId,
  selected: selectedGame,
  add: addGame,
  remove: removeGame,
  pickFirst,
} = useMyGames();

function addGameToList(game: Game) {
  const entry = addGame(game);
  if (entry) queue.log('info', `added ${game.name} to my games`);
}

function removeGameFromList(game: Game) {
  removeGame(game);
}

/* --------------------------------------------------------- context menu */

function copyId(id: string) {
  void navigator.clipboard?.writeText(id).catch(() => undefined);
}

/** Right-click on a library row: focus it, then offer the useful actions. */
function onGameContext(game: Game, event: MouseEvent) {
  selectedGameId.value = game.uid ?? null;

  const queued = queue.isQueued(game);
  const items: ContextMenuItem[] = [
    {
      key: 'play',
      label: game.is_running ? t('home.stop') : t('home.play'),
      icon: game.is_running ? 'stop' : 'play',
      disabled: rpcBusy.value,
    },
    queued
      ? { key: 'unqueue', label: t('queue.removeFromQueue'), icon: 'queue' }
      : { key: 'queue', label: t('home.queueAdd'), icon: 'queue' },
    { key: 'copy', label: t('common.copyId'), icon: 'copy' },
    { key: 'remove', label: t('common.remove'), icon: 'trash', danger: true },
  ];

  openContextMenu(event, items, (key) => {
    if (key === 'play') {
      void handlePlayToggle(game);
    } else if (key === 'queue') {
      queue.addToQueue(game);
    } else if (key === 'unqueue') {
      const entry = queue.entries.find((e) => e.game.id === game.id);
      if (entry) queue.removeFromQueue(entry);
    } else if (key === 'copy') {
      copyId(game.id);
    } else if (key === 'remove') {
      removeGameFromList(game);
    }
  });
}

/* -------------------------------------------------------- manual sessions */

const rpcBusy = ref(false);
const showRiskDialog = ref(false);
const pendingGame = ref<Game | null>(null);
/** Derive the test preview from global state so it survives page switches. */
const testRpcGameId = computed(() =>
  liveSession.value?.mode === 'test' ? liveSession.value.gameId : null,
);

/** The executable the running session should impersonate. */
function pickExecutable(game: Game): GameExecutable | null {
  const candidates = (game.executables ?? []).filter((exe) => !!exe.filename && exe.path !== undefined);
  if (candidates.length === 0) return null;

  return candidates.find((exe) => exe.os === getCurrentOS()) ?? null;
}

async function stopPid(pid?: number) {
  if (!pid) return;
  await invoke('stop_process', { pid });
}

function warnRunningSession() {
  flashWarning.value = t('home.stopRunningFirst');
}

/**
 * Test RPC is only a manual Rich Presence preview. It never launches a game
 * process, and deliberately does not pretend to be Play.
 */
async function startTestRpc(game: Game) {
  if (rpcBusy.value) return;
  if (queue.running || game.is_running) {
    warnRunningSession();
    return;
  }

  rpcBusy.value = true;
  try {
    // Switching previews should not leave the previous app id connected.
    if (testRpcGameId.value && testRpcGameId.value !== game.id) {
      try {
        await disconnectPresence();
      } catch {
        /* nothing was connected */
      }
      if (liveSession.value?.mode === 'test') clearLiveSession();
    }

    await connectPresence(game, { details: game.name, state: 'Playfy Test RPC' });
    setLiveSession(game.id, game.name, 'test');
    queue.log(
      'info',
      `test RPC active for ${game.name} — preview only; Discord Quests and Recently Played do not count this`,
    );
  } catch (error) {
    if (liveSession.value?.mode === 'test') clearLiveSession();
    queue.log('error', `test RPC failed for ${game.name}: ${String(error)}`);
  } finally {
    rpcBusy.value = false;
  }
}

async function stopTestRpc() {
  if (rpcBusy.value) return;
  rpcBusy.value = true;
  const gameId = testRpcGameId.value;
  try {
    await disconnectPresence();
    if (liveSession.value?.mode === 'test' && liveSession.value.gameId === gameId) {
      clearLiveSession();
    }
    queue.log('info', 'test RPC stopped');
  } catch (error) {
    queue.log('error', `failed to stop test RPC: ${String(error)}`);
  } finally {
    rpcBusy.value = false;
  }
}

function handleTestRpcToggle() {
  if (!selectedGame.value) {
    flashWarning.value = t('home.noGameSelected');
    return;
  }
  if (rpcBusy.value) return;

  const game = selectedGame.value;
  if (testRpcGameId.value === game.id) {
    void stopTestRpc();
    return;
  }

  if (queue.running || game.is_running) {
    warnRunningSession();
    return;
  }

  pendingGame.value = game;
  showRiskDialog.value = true;
}

async function handlePlayToggle(game: Game) {
  if (rpcBusy.value) return;
  if (game.is_running) {
    await stopSession(game);
    return;
  }

  const exe = pickExecutable(game);
  if (!exe?.filename) {
    flashWarning.value = t('home.noExecutables');
    return;
  }
  await startSession(game, exe);
}

/**
 * Play starts Playfy's native compatibility host under the selected image
 * name and opens a separate C# session card. It does not launch the game
 * executable or send Rich Presence; Discord's process detection may vary by
 * game and client version.
 */
async function startSession(game: Game, executable?: GameExecutable | null) {
  if (rpcBusy.value) return;
  if (queue.running) {
    warnRunningSession();
    return;
  }

  const exe = executable ?? pickExecutable(game);
  if (!exe?.filename) {
    flashWarning.value = t('home.noExecutables');
    return;
  }

  rpcBusy.value = true;
  let gamePid: number | undefined;
  let uiPid: number | undefined;
  try {
    if (testRpcGameId.value) {
      try {
        await disconnectPresence();
      } catch {
        /* nothing was connected */
      }
      if (liveSession.value?.mode === 'test') clearLiveSession();
    }

    if (!exe.is_installed) await createDummyGame(game, exe);
    const pids = await invoke<SessionPids>('run_background_process', {
      name: game.name,
      path: exe.path,
      executable_name: exe.filename,
      path_len: exe.segments,
      app_id: game.id,
      cover: primaryArtUrl(game) ?? '',
      icon: gameIconUrl(game) ?? '',
      url: storePageUrl(game) ?? '',
    });

    gamePid = pids.game_pid;
    uiPid = pids.ui_pid;
    exe.pid = gamePid;
    exe.uiPid = uiPid;
    exe.is_running = true;
    game.is_running = true;
    setLiveSession(game.id, game.name, 'play');

    queue.log(
      'info',
      `Playfy compatibility host for ${game.name} is running as process ${gamePid}`,
    );
  } catch (error) {
    queue.log('error', `could not start ${game.name}: ${String(error)}`);
    await stopPid(gamePid);
    await stopPid(uiPid);
    exe.pid = undefined;
    exe.uiPid = undefined;
    exe.is_running = false;
    game.is_running = false;
    if (liveSession.value?.mode === 'play') clearLiveSession();
  } finally {
    rpcBusy.value = false;
  }
}

/** Stops both Playfy-owned processes. The PIDs are always scoped; never kill by image name. */
async function stopSession(game?: Game | null) {
  const target = game ?? selectedGame.value;
  if (rpcBusy.value) return;
  rpcBusy.value = true;
  try {
    if (target) {
      let failures = 0;
      for (const exe of target.executables ?? []) {
        for (const key of ['pid', 'uiPid'] as const) {
          const pid = exe[key];
          if (!pid) continue;
          try {
            await stopPid(pid);
            exe[key] = undefined;
          } catch (error) {
            failures++;
            queue.log('error', `could not stop ${target.name} (PID ${pid}): ${String(error)}`);
          }
        }
        exe.is_running = !!(exe.pid || exe.uiPid);
      }
      target.is_running = (target.executables ?? []).some((exe) => exe.is_running);
      if (!target.is_running && liveSession.value?.mode === 'play' && liveSession.value.gameId === target.id) {
        clearLiveSession();
      }
      if (failures === 0) queue.log('info', `stopped ${target.name}`);
      else flashWarning.value = t('home.stopFailed');
    }
  } catch (error) {
    queue.log('error', `failed to stop: ${String(error)}`);
  } finally {
    rpcBusy.value = false;
  }
}

async function acceptRiskAndConnect() {
  showRiskDialog.value = false;
  const game = pendingGame.value ?? selectedGame.value;
  pendingGame.value = null;
  if (!game) return;
  await startTestRpc(game);
}

const dialogRoot = ref<HTMLElement | null>(null);
onClickOutside(dialogRoot, () => (showRiskDialog.value = false));

const flashWarning = ref('');
let flashTimer: number | null = null;
watch(flashWarning, (value) => {
  if (!value) return;
  if (flashTimer !== null) window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => (flashWarning.value = ''), 3200);
});

/* ------------------------------------------------------------- execution */

async function createDummyGame(game: Game, executable: GameExecutable) {
  const payload = {
    path: executable.path,
    executable_name: executable.filename,
    path_len: executable.segments,
    app_id: game.id,
    display_name: game.name,
  };
  await invoke('create_fake_game', payload);
  game.is_installed = true;
  executable.is_installed = true;
  return true;
}

async function installAndPlay({ game, executable }: { game: Game; executable: GameExecutable }) {
  try {
    const created = await createDummyGame(game, executable);
    if (created) await startSession(game, executable);
  } catch (error) {
    queue.log('error', `failed to create game: ${String(error)}`);
  }
}

async function playGame({ game, executable }: { game: Game; executable: GameExecutable }) {
  await startSession(game, executable);
}

async function stopPlaying({ game }: { game: Game; executable: GameExecutable }) {
  await stopSession(game);
}

provide<GameActionsProvider>(GameActionsKey, {
  canPlayGame: (game) => !!game?.is_installed && !game?.is_running,
  isGameInstalled: (game) => game?.is_installed ?? false,
  isExecutableRunning: (executable) => executable.is_running ?? false,
  isGameExecutableInstalled: (executable) => executable.is_installed ?? false,
});

/* ----------------------------------------------------------------- misc */

const fetching = computed(() => isLoadingDiscord.value || isLoadingBundled.value);

const selectedStoreUrl = computed(() => storePageUrl(selectedGame.value));

/** Discord sometimes lists the canonical title as its own alias — show it once. */
const displayAliases = computed(() => {
  const game = selectedGame.value;
  if (!game) return [];
  const canonical = normalize(game.name).trim();
  return (game.aliases ?? []).filter((alias) => {
    const value = normalize(alias).trim();
    return value.length > 0 && value !== canonical;
  });
});

tryOnMounted(() => {
  pickFirst();
});
</script>

<template>
  <div class="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
    <!-- page header -->
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-[22px] font-semibold tracking-tight text-ink">{{ t('home.title') }}</h1>
        <p class="mt-0.5 max-w-xl text-[13px] text-muted">{{ t('home.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="chip">
          <Icon name="games" :size="13" />
          {{ gameDB.length.toLocaleString() }} {{ t('home.totalGames') }}
        </span>
        <span v-if="fetching" class="chip">
          <Icon name="spinner" :size="12" class="spin" />
          {{ t('common.loading') }}
        </span>
        <button class="btn !py-1.5" :disabled="fetching" @click="fetchGameList()">
          <Icon name="refresh" :size="14" :class="fetching ? 'spin' : ''" />
          {{ t('home.refetch') }}
        </button>
      </div>
    </header>

    <!-- search -->
    <section class="relative z-20">
      <SearchBar
        :results="searchResults"
        :placeholder="t('home.placeholder')"
        @search="onSearch"
        @add="addGameToList"
      />
      <p class="mt-1.5 px-1 text-[11.5px] text-faint">{{ t('home.hint') }}</p>

      <Transition
        enter-active-class="transition-opacity duration-200"
        leave-active-class="transition-opacity duration-300"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <div
          v-if="flashWarning"
          class="mt-2 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-warning"
        >
          <Icon name="info" :size="14" />
          {{ flashWarning }}
        </div>
      </Transition>
    </section>

    <!-- my games + actions -->
    <section class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div class="panel p-4">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-[14px] font-semibold text-ink">
            {{ t('home.myGames') }}
            <span class="chip ms-2">{{ gameList.length }}</span>
          </h2>
        </div>

        <div v-if="gameList.length === 0" class="py-10 text-center">
          <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-ink/5 text-faint">
            <Icon name="games" :size="22" />
          </div>
          <p class="text-[13px] text-muted">{{ t('home.myGamesEmpty') }}</p>
        </div>

        <TransitionGroup v-else name="game" tag="div" class="relative flex max-h-[450px] flex-col gap-1.5 overflow-y-auto pe-1">
          <article
            v-for="game in gameList"
            :key="game.uid ?? game.id"
            class="group flex cursor-pointer items-center gap-3.5 rounded-xl border px-2.5 py-2.5 transition-colors"
            :class="
              selectedGame?.uid === game.uid
                ? 'border-accent/60 bg-accent-soft'
                : 'border-transparent hover:bg-ink/[0.04]'
            "
            @click="selectedGameId = game.uid ?? null"
            @contextmenu="onGameContext(game, $event)"
          >
            <span class="h-12 w-[84px] flex-none overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_rgba(0,0,0,0.28)]">
              <GameArt :game="game" />
            </span>

            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-1.5">
                <span class="truncate text-[13.5px] font-medium text-ink">{{ game.name }}</span>
                <Icon name="verified" :size="12" class="flex-none text-[#23a55a]" />
                <span
                  v-if="game.is_running"
                  class="h-1.5 w-1.5 flex-none rounded-full bg-success"
                  :title="t('home.running')"
                ></span>
              </span>
              <span class="block truncate font-mono text-[11px] text-faint">{{ game.id }}</span>
            </span>

            <button
              class="chip !py-1 transition-colors hover:bg-ink/[0.07] hover:text-accent"
              :class="queue.isQueued(game) ? 'border-accent/50 text-accent' : ''"
              :title="queue.isQueued(game) ? t('home.queueAdded') : t('home.queueAdd')"
              @click.stop="queue.addToQueue(game)"
            >
              <Icon :name="queue.isQueued(game) ? 'check' : 'queue'" :size="12" />
            </button>
            <button
              class="rounded-md p-1 text-faint opacity-0 transition-all hover:bg-danger/15 hover:text-danger focus:opacity-100 group-hover:opacity-100"
              :title="t('common.remove')"
              @click.stop="removeGameFromList(game)"
            >
              <Icon name="trash" :size="14" />
            </button>
          </article>
        </TransitionGroup>
      </div>

      <!-- actions -->
      <aside class="panel sticky top-4 overflow-hidden">
        <template v-if="selectedGame">
          <!-- hero: the artwork stays crisp while the game is live -->
          <div class="relative h-36 overflow-hidden">
            <div class="absolute inset-0">
              <GameArt :game="selectedGame" />
            </div>
            <div
              class="absolute inset-0 transition-colors duration-500"
              :style="{
                background:
                  'linear-gradient(to top, rgb(var(--c-panel-rgb) / 1), rgb(var(--c-panel-rgb) / 0.45) 55%, rgb(var(--c-panel-rgb) / 0.1))',
              }"
            ></div>
            <div class="absolute inset-x-0 bottom-0 px-4 pb-3">
              <div class="mt-0.5 flex items-center justify-between gap-2">
                <p class="font-mono text-[11px] text-faint">{{ t('home.gameId') }} · {{ selectedGame.id }}</p>
                <a
                  v-if="selectedStoreUrl"
                  class="chip flex-none !py-0.5 transition-colors hover:bg-ink/[0.07] hover:text-accent"
                  :href="selectedStoreUrl"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="external" :size="11" />
                  {{ t('home.storePage') }}
                </a>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-3 p-4 pt-2">
            <div v-if="displayAliases.length" class="flex flex-wrap gap-1.5">
              <span v-for="alias in displayAliases" :key="alias" class="chip max-w-40 truncate font-mono">
                {{ alias }}
              </span>
            </div>

            <div>
              <button
                class="btn w-full !bg-ink/[0.035] !py-1.5 text-[12px] font-medium !text-muted transition-colors hover:!bg-ink/[0.07] hover:!text-ink"
                :disabled="rpcBusy || ((queue.running || selectedGame.is_running) && testRpcGameId !== selectedGame.id)"
                :title="queue.running || selectedGame.is_running ? t('home.stopRunningFirst') : ''"
                @click="handleTestRpcToggle"
              >
                <Icon
                  :name="rpcBusy ? 'spinner' : testRpcGameId === selectedGame.id ? 'x' : 'globe'"
                  :size="13"
                  :class="rpcBusy ? 'spin' : ''"
                />
                {{ testRpcGameId === selectedGame.id ? t('home.testRpcStop') : t('home.testRpc') }}
              </button>
              <p class="mt-1.5 px-1 text-[11px] leading-relaxed text-faint">
                {{ t('home.testRpcHint') }}
              </p>
            </div>

            <div class="rounded-xl border border-line bg-ink/[0.03] p-3">
              <h3 class="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-faint">
                {{ t('home.status') }}
              </h3>
              <p
                class="text-[12.5px]"
                :class="
                  selectedGame.is_running
                    ? 'text-success'
                    : testRpcGameId === selectedGame.id
                      ? 'text-warning'
                      : 'text-muted'
                "
              >
                {{
                  selectedGame.is_running
                    ? t('home.playing')
                    : testRpcGameId === selectedGame.id
                      ? t('home.testRpcActive')
                      : t('home.notPlaying')
                }}
              </p>
              <p
                v-if="testRpcGameId === selectedGame.id"
                class="mt-1.5 text-[11px] leading-relaxed text-faint"
              >
                {{ t('home.testRpcHistoryHint') }}
              </p>
            </div>

            <GameExecutables
              :game="selectedGame"
              @play="playGame"
              @stop="stopPlaying"
              @install_and_play="installAndPlay"
            />
          </div>
        </template>

        <div v-else class="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <div class="flex h-11 w-11 items-center justify-center rounded-2xl border border-line bg-ink/5 text-faint">
            <Icon name="search" :size="20" />
          </div>
          <p class="text-[12.5px] text-muted">{{ t('home.selectGame') }}</p>
        </div>
      </aside>
    </section>

    <!-- risk dialog -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showRiskDialog"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      >
        <div ref="dialogRoot" class="panel-elevated fade-up w-full max-w-md p-5">
          <h3 class="mb-2 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Icon name="info" :size="16" class="text-warning" />
            {{ t('home.rpcWarningTitle') }}
          </h3>
          <p class="mb-4 text-[13px] leading-relaxed text-muted">{{ t('home.rpcWarningBody') }}</p>
          <div class="flex justify-end gap-2">
            <button class="btn" @click="showRiskDialog = false">{{ t('common.cancel') }}</button>
            <button class="btn btn-accent" @click="acceptRiskAndConnect">
              {{ t('home.rpcWarningAccept') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
