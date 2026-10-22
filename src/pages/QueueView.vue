<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import GameArt from '@/components/GameArt.vue';
import Icon from '@/components/ui/Icon.vue';
import SearchBar from '@/components/SearchBar.vue';
import { useFetchGameList } from '@/composables/fetch-gamelist';
import { openContextMenu, type ContextMenuItem } from '@/composables/context-menu';
import { useI18n, formatClock } from '@/composables/i18n';
import { useQueue, type QueueEntry } from '@/composables/queue';
import { storePageUrl } from '@/composables/game-art';
import { useSettings } from '@/composables/settings';
import type { Game } from '@/types/types';

const { gameDB } = useFetchGameList();
const { t } = useI18n();
const queue = useQueue();
const { settings } = useSettings();

/** Store link for whatever the rotation is broadcasting right now. */
const currentStoreUrl = computed(() => storePageUrl(queue.current?.game ?? null));

/* ----------------------------------------------------------- catalogue */

const catalogQuery = shallowRef('');
const debouncedQuery = shallowRef('');
let debounceTimer: number | null = null;

watch(catalogQuery, (value) => {
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => (debouncedQuery.value = value), 150);
});

const normalizedQuery = computed(() => debouncedQuery.value.trim().toLowerCase());

const catalogResults = computed(() => {
  const query = normalizedQuery.value;
  // Idle: expose the whole catalogue — rendering is windowed anyway, so there is
  // no reason to hide games the user could scroll to.
  if (!query) return gameDB.value;
  const matches: Game[] = [];
  for (const game of gameDB.value) {
    if (game.name.toLowerCase().includes(query)) {
      matches.push(game);
      continue;
    }
    if (game.aliases?.some((alias) => alias.toLowerCase().includes(query))) matches.push(game);
    if (matches.length >= 300) break;
  }
  return matches;
});

/** Cheap windowing: render 60 rows, grow as the sentinel scrolls into view. */
const PAGE = 60;
const visibleCount = ref(PAGE);
watch(catalogResults, () => (visibleCount.value = PAGE));
const visibleCatalog = computed(() => catalogResults.value.slice(0, visibleCount.value));

/** Top matches surface inside the search box itself, cover art and all. */
const catalogPreview = computed(() => catalogResults.value.slice(0, 8));

const sentinelRef = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) visibleCount.value += PAGE;
    },
    { rootMargin: '240px' },
  );
  if (sentinelRef.value) observer.observe(sentinelRef.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  endDrag();
});

function onCatalogSearch(query: string) {
  catalogQuery.value = query;
}

function addFromCatalog(game: Game) {
  queue.addToQueue(game);
}

/* --------------------------------------------------------------- timer */

const minutes = computed({
  get: () => Math.round(queue.intervalSec / 6) / 10,
  set: (value: number) => queue.setIntervalSeconds(Math.max(0.25, value || 0.25) * 60),
});

const PRESETS = [
  { labelKey: 'queue.preset1m', seconds: 60 },
  { labelKey: 'queue.preset5m', seconds: 300 },
  { labelKey: 'queue.preset10m', seconds: 600 },
  { labelKey: 'queue.preset30m', seconds: 1800 },
  { labelKey: 'queue.preset1h', seconds: 3600 },
];

/* --------------------------------------------------------- drag ordering
 * Pointer-based rather than HTML5 drag-and-drop: WebView2 swallows native
 * drags in a Tauri window unless the whole shell opts out, and the native
 * ghost is hard to style. Tracking the pointer ourselves works everywhere,
 * on mouse and touch, and gives us the floating card + drop line. */

const dragUid = ref<string | null>(null);
const dragging = ref(false);
const dropSlot = ref<number | null>(null);

let dragRow: HTMLElement | null = null;
let dragGhost: HTMLElement | null = null;
let dragSource: QueueEntry | null = null;
let dragStartX = 0;
let dragStartY = 0;
let dragOffsetX = 0;
let dragOffsetY = 0;
let dropContainer: HTMLElement | null = null;

function setGhostPosition(x: number, y: number) {
  if (!dragGhost) return;
  dragGhost.style.transform = `translate3d(${x - dragOffsetX}px, ${y - dragOffsetY}px, 0) rotate(1.5deg)`;
}

function onGripPointerDown(entry: QueueEntry, event: PointerEvent) {
  if (event.button !== 0) return;
  const grip = event.currentTarget as HTMLElement;
  const row = grip.closest('[data-drag-row]') as HTMLElement | null;
  if (!row) return;

  event.preventDefault();
  dragUid.value = entry.uid;
  dragSource = entry;
  dragRow = row;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dropContainer = row.parentElement;

  const rect = row.getBoundingClientRect();
  dragOffsetX = event.clientX - rect.left;
  dragOffsetY = event.clientY - rect.top;

  window.addEventListener('pointermove', onGripPointerMove);
  window.addEventListener('pointerup', onGripPointerUp);
  window.addEventListener('pointercancel', endDrag);
}

function beginDragGhost() {
  if (!dragRow || dragGhost) return;
  const rect = dragRow.getBoundingClientRect();
  const ghost = dragRow.cloneNode(true) as HTMLElement;
  ghost.style.position = 'fixed';
  ghost.style.top = '0';
  ghost.style.left = '0';
  ghost.style.width = `${rect.width}px`;
  ghost.style.margin = '0';
  ghost.style.pointerEvents = 'none';
  ghost.style.opacity = '0.96';
  ghost.style.zIndex = '80';
  ghost.style.borderRadius = '12px';
  ghost.style.boxShadow = '0 20px 45px rgba(0, 0, 0, 0.5)';
  ghost.style.background = 'rgb(var(--c-panel-rgb))';
  document.body.appendChild(ghost);
  dragGhost = ghost;
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'grabbing';
}

function onGripPointerMove(event: PointerEvent) {
  if (!dragUid.value || !dragRow) return;

  if (!dragging.value) {
    // A few pixels of slack keeps a plain click on the grip from turning into
    // a drag and swallowing the click.
    if (Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY) < 4) return;
    dragging.value = true;
    beginDragGhost();
    dragRow.style.opacity = '0.35';
  }

  setGhostPosition(event.clientX, event.clientY);

  if (!dropContainer) return;
  const rows = Array.from(dropContainer.querySelectorAll<HTMLElement>('[data-drag-row]'));
  let slot = rows.length;
  for (let i = 0; i < rows.length; i++) {
    const rect = rows[i].getBoundingClientRect();
    if (event.clientY < rect.top + rect.height / 2) {
      slot = i;
      break;
    }
  }
  dropSlot.value = slot;

  // Nudge the list when the pointer reaches its top/bottom edge.
  const bounds = dropContainer.getBoundingClientRect();
  if (event.clientY < bounds.top + 34) dropContainer.scrollTop -= 10;
  else if (event.clientY > bounds.bottom - 34) dropContainer.scrollTop += 10;
}

function onGripPointerUp() {
  if (dragging.value && dragSource && dropSlot.value !== null) {
    const from = queue.entries.findIndex((entry) => entry.uid === dragSource?.uid);
    if (from !== -1) queue.moveEntryTo(dragSource, dropSlot.value);
  }
  endDrag();
}

function endDrag() {
  window.removeEventListener('pointermove', onGripPointerMove);
  window.removeEventListener('pointerup', onGripPointerUp);
  window.removeEventListener('pointercancel', endDrag);

  if (dragRow) dragRow.style.opacity = '';
  dragGhost?.remove();
  dragGhost = null;
  dragRow = null;
  dragSource = null;
  dropContainer = null;
  dragUid.value = null;
  dragging.value = false;
  dropSlot.value = null;
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
}

function copyId(id: string) {
  void navigator.clipboard?.writeText(id).catch(() => undefined);
}

/* -------------------------------------------------------- context menus */

function onEntryContext(entry: QueueEntry, event: MouseEvent) {
  const items: ContextMenuItem[] = [
    { key: 'jump', label: t('queue.playNow'), icon: 'play', disabled: !queue.running },
    { key: 'copy', label: t('common.copyId'), icon: 'copy' },
    { key: 'remove', label: t('common.remove'), icon: 'trash', danger: true },
  ];
  openContextMenu(event, items, (key) => {
    if (key === 'jump') {
      const position = queue.entries.findIndex((e) => e.uid === entry.uid);
      if (position !== -1) void queue.jumpTo(position);
    } else if (key === 'copy') {
      copyId(entry.game.id);
    } else if (key === 'remove') {
      queue.removeFromQueue(entry);
    }
  });
}

function onCatalogContext(game: Game, event: MouseEvent) {
  const queued = queue.isQueued(game);
  const items: ContextMenuItem[] = [
    queued
      ? { key: 'unqueue', label: t('queue.removeFromQueue'), icon: 'x', danger: true }
      : { key: 'add', label: t('queue.addToQueue'), icon: 'plus' },
    { key: 'copy', label: t('common.copyId'), icon: 'copy' },
  ];
  openContextMenu(event, items, (key) => {
    if (key === 'add') {
      queue.addToQueue(game);
    } else if (key === 'unqueue') {
      const entry = queue.entries.find((e) => e.game.id === game.id);
      if (entry) queue.removeFromQueue(entry);
    } else if (key === 'copy') {
      copyId(game.id);
    }
  });
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-[22px] font-semibold tracking-tight text-ink">{{ t('queue.title') }}</h1>
        <p class="mt-0.5 max-w-2xl text-[13px] text-muted">{{ t('queue.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="chip">
          <Icon name="queue" :size="13" />
          {{ queue.entries.length }} {{ t('queue.gamesInQueue') }}
        </span>
        <span class="chip" :class="queue.running ? 'border-success/50 text-success' : ''">
          {{ queue.running ? (queue.paused ? t('queue.pausedStatus') : t('queue.runningStatus')) : t('queue.idle') }}
        </span>
      </div>
    </header>

    <!-- rotation controls -->
    <section class="panel flex flex-wrap items-center gap-x-6 gap-y-4 p-4">
      <div class="flex flex-col gap-1.5">
        <span class="text-[11.5px] font-semibold uppercase tracking-wider text-faint">
          {{ t('queue.interval') }}
        </span>
        <div class="flex items-center gap-2">
          <input
            v-model.number="minutes"
            type="number"
            min="0.25"
            max="1440"
            step="0.25"
            class="field !w-24 !py-1.5 text-center font-mono"
          />
          <span class="text-[12.5px] text-muted">{{ t('common.min') }}</span>
          <div class="flex flex-wrap items-center gap-1">
            <button
              v-for="preset in PRESETS"
              :key="preset.seconds"
              class="chip transition-colors"
              :class="queue.intervalSec === preset.seconds ? 'border-accent text-accent' : 'hover:text-ink'"
              @click="queue.setIntervalSeconds(preset.seconds)"
            >
              {{ t(preset.labelKey) }}
            </button>
          </div>
        </div>
        <span class="text-[11px] text-faint">{{ t('queue.intervalHint') }}</span>
      </div>

      <div class="flex items-center gap-2 self-start pt-4">
        <button
          class="switch"
          role="switch"
          :aria-checked="queue.loop"
          @click="queue.loop = !queue.loop"
        ></button>
        <div class="flex flex-col">
          <span class="text-[12.5px] font-medium text-ink">{{ t('queue.loop') }}</span>
          <span class="text-[11px] text-faint">{{ t('queue.loopHint') }}</span>
        </div>
      </div>

      <div class="ms-auto flex items-center gap-2 self-start pt-4">
        <button
          v-if="queue.running"
          class="btn"
          @click="queue.paused ? queue.resume() : queue.pause()"
        >
          <Icon :name="queue.paused ? 'play' : 'pause'" :size="14" />
          {{ queue.paused ? t('queue.resume') : t('queue.pause') }}
        </button>
        <button
          v-if="queue.running"
          class="btn btn-danger"
          @click="queue.stop()"
        >
          <Icon name="stop" :size="14" />
          {{ t('queue.stop') }}
        </button>
        <button v-else class="btn btn-accent" @click="queue.start()">
          <Icon name="play" :size="14" />
          {{ t('queue.start') }}
        </button>
      </div>

      <!-- live hero: the blurred cover crossfades behind the info on every rotation -->
      <div
        v-if="queue.running && queue.current"
        class="relative w-full overflow-hidden rounded-xl border border-line"
      >
        <Transition
          mode="out-in"
          enter-active-class="transition-opacity duration-500 ease-out"
          leave-active-class="transition-opacity duration-300 ease-in"
          enter-from-class="opacity-0"
          leave-to-class="opacity-0"
        >
          <div :key="queue.current.uid" class="absolute inset-0 scale-125 blur-xl">
            <GameArt :game="queue.current.game" />
          </div>
        </Transition>
        <!-- scrim keeps every theme readable over busy artwork -->
        <div class="absolute inset-0 bg-black/45"></div>

        <div class="relative flex flex-wrap items-center gap-4 px-4 py-3.5">
          <div class="flex items-center gap-3">
            <div class="h-12 w-20 flex-none overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_rgba(0,0,0,0.3),0_10px_24px_rgba(0,0,0,0.35)]">
              <GameArt :game="queue.current.game" />
            </div>
            <div class="flex min-w-0 flex-col gap-0.5">
              <span class="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-white/65">
                <span class="relative flex h-1.5 w-1.5">
                  <span
                    class="absolute inline-flex h-full w-full rounded-full bg-success opacity-75"
                    :class="queue.paused ? '' : 'animate-ping'"
                  ></span>
                  <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-success"></span>
                </span>
                {{ queue.paused ? t('queue.pausedStatus') : t('queue.runningStatus') }}
              </span>
              <span class="truncate text-[15px] font-semibold text-white drop-shadow">{{ queue.current.game.name }}</span>
            </div>
          </div>

          <div class="flex min-w-40 flex-1 flex-col gap-1">
            <div class="h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                class="h-full rounded-full bg-accent transition-[width] duration-500 ease-linear"
                :style="{ width: `${Math.round(queue.progress * 100)}%` }"
              ></div>
            </div>
            <div class="flex justify-between font-mono text-[11px] text-white/60">
              <span>{{ formatClock(queue.elapsedSec) }}</span>
              <span>-{{ formatClock(queue.remainingSec) }}</span>
            </div>
          </div>

          <div v-if="queue.next" class="flex items-center gap-2">
            <div class="h-9 w-14 flex-none overflow-hidden rounded-md opacity-80 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.3)]">
              <GameArt :game="queue.next.game" />
            </div>
            <div class="flex flex-col">
              <span class="text-[10.5px] font-semibold uppercase tracking-wider text-white/55">
                {{ t('queue.next') }}
              </span>
              <span class="max-w-32 truncate text-[12.5px] text-white/85">{{ queue.next.game.name }}</span>
            </div>
          </div>

          <a
            v-if="currentStoreUrl"
            class="chip flex-none border-white/25 bg-black/25 text-white/85 transition-colors hover:bg-black/40 hover:text-white"
            :href="currentStoreUrl"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="external" :size="12" />
            {{ t('home.storePage') }}
          </a>
        </div>
      </div>
    </section>

    <!-- queue + catalogue -->
    <section class="grid items-start gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <!-- my queue -->
      <div class="panel flex flex-col p-4">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-[14px] font-semibold text-ink">
            {{ t('queue.myQueue') }}
            <span class="chip ms-2">{{ queue.entries.length }}</span>
          </h2>
          <button
            v-if="queue.entries.length > 0"
            class="btn btn-ghost !px-2 !py-1 text-[12px] text-danger"
            @click="queue.clearQueue()"
          >
            <Icon name="trash" :size="13" />
            {{ t('queue.clearAll') }}
          </button>
        </div>

        <div v-if="queue.entries.length === 0" class="py-8 text-center">
          <div class="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-line bg-ink/5 text-faint">
            <Icon name="queue" :size="20" />
          </div>
          <p class="text-[12.5px] text-muted">{{ t('queue.emptyQueue') }}</p>
        </div>

        <div v-else class="flex max-h-[492px] flex-col gap-1.5 overflow-y-auto pe-1">
          <div
            v-for="(entry, index) in queue.entries"
            :key="entry.uid"
            data-drag-row
            class="card-hover group relative flex items-center gap-3 rounded-xl border px-2.5 py-2.5 transition-colors"
            :class="[
              queue.index === index && queue.running
                ? 'border-accent/60 bg-accent-soft'
                : 'border-line bg-ink/[0.03]',
              dragUid === entry.uid ? 'opacity-40' : '',
            ]"
            @contextmenu="onEntryContext(entry, $event)"
          >
            <!-- glowing line that shows exactly where the game will land -->
            <span
              v-if="dragging && dropSlot === index"
              class="pointer-events-none absolute inset-x-1.5 -top-[3px] h-0.5 rounded-full bg-accent shadow-[0_0_10px_var(--color-accent)]"
            ></span>
            <!-- three-line grip: grab it and drag the game into a new slot -->
            <span
              class="flex-none cursor-grab touch-none rounded-md p-0.5 text-faint transition-colors hover:bg-ink/8 hover:text-ink active:cursor-grabbing"
              :title="t('queue.order')"
              @pointerdown="onGripPointerDown(entry, $event)"
            >
              <Icon name="grip" :size="14" />
            </span>
            <span class="w-5 flex-none text-center font-mono text-[12px] text-faint">{{ index + 1 }}</span>
            <div class="h-12 w-[84px] flex-none overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_rgba(0,0,0,0.28)]">
              <GameArt :game="entry.game" />
            </div>
            <button
              class="min-w-0 flex-1 truncate text-start text-[13px] font-medium text-ink"
              :title="entry.game.name"
              @click="queue.jumpTo(index)"
            >
              {{ entry.game.name }}
            </button>

            <button
              class="flex-none rounded-md p-1 text-faint transition-colors hover:bg-danger/15 hover:text-danger"
              :title="t('common.remove')"
              @click="queue.removeFromQueue(entry)"
            >
              <Icon name="x" :size="13" />
            </button>
          </div>

          <!-- tail drop target: the very end of the queue -->
          <div v-if="dragging && dropSlot === queue.entries.length" class="relative h-0.5">
            <span class="pointer-events-none absolute inset-x-1.5 h-0.5 rounded-full bg-accent shadow-[0_0_10px_var(--color-accent)]"></span>
          </div>
        </div>
      </div>

      <!-- catalogue -->
      <div class="panel flex min-h-0 flex-col p-4">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="text-[14px] font-semibold text-ink">
            {{ t('queue.catalog') }}
            <span class="chip ms-2">{{ catalogResults.length.toLocaleString() }} {{ t('queue.catalogCount') }}</span>
          </h2>
        </div>

        <SearchBar
          class="mb-3"
          :results="catalogPreview"
          :placeholder="t('queue.searchCatalog')"
          @search="onCatalogSearch"
          @add="addFromCatalog"
        />

        <div class="max-h-[440px] min-h-0 overflow-y-auto pe-1">
          <div v-if="catalogResults.length === 0" class="py-10 text-center text-[12.5px] text-muted">
            {{ t('queue.catalogEmpty') }}
          </div>

          <div v-else class="flex flex-col gap-1">
            <div
              v-for="game in visibleCatalog"
              :key="game.id"
              class="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-ink/5"
              @contextmenu="onCatalogContext(game, $event)"
            >
              <div class="h-11 w-[76px] flex-none overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_rgba(0,0,0,0.28)]">
                <GameArt :game="game" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate text-[13px] font-medium text-ink">{{ game.name }}</div>
                <div class="truncate text-[11px] text-faint">
                  {{ game.themes?.slice(0, 2).join(' · ') || t('home.gameId') }} · {{ game.id }}
                </div>
              </div>
              <button
                class="chip flex-none transition-colors"
                :class="
                  queue.isQueued(game)
                    ? 'border-accent/50 text-accent'
                    : 'hover:bg-ink/[0.08] hover:text-accent'
                "
                :disabled="queue.isQueued(game)"
                @click="addFromCatalog(game)"
              >
                <Icon :name="queue.isQueued(game) ? 'check' : 'plus'" :size="12" />
                {{ queue.isQueued(game) ? t('queue.inQueue') : t('queue.addToQueue') }}
              </button>
            </div>

            <div ref="sentinelRef" class="h-px w-full"></div>
            <div
              v-if="visibleCount < catalogResults.length"
              class="py-2 text-center text-[11.5px] text-faint"
            >
              {{ visibleCount }} / {{ catalogResults.length }}
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
