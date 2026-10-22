<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { onClickOutside } from '@vueuse/core';
import GameArt from './GameArt.vue';
import Icon from './ui/Icon.vue';
import { useI18n } from '@/composables/i18n';
import type { Game } from '@/types/types';

/**
 * Floating-label search box. The label lifts out of the field on hover, on
 * focus, or as soon as something is typed; the current best match shows its
 * cover art right inside the box; adding a game clears the field and closes
 * the dropdown so the list below stays the focus.
 */
const props = defineProps<{
  placeholder: string;
  results: Game[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  search: [query: string];
  add: [game: Game];
}>();

const { t } = useI18n();

const query = ref('');
const open = ref(false);
const focused = ref(false);
const hovered = ref(false);
const cursor = ref(0);
const rootRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);

onClickOutside(rootRef, () => (open.value = false));

watch(
  () => props.results,
  () => {
    cursor.value = 0;
  },
);

const preview = computed<Game | null>(() => props.results[cursor.value] ?? null);
const raised = computed(() => hovered.value || focused.value || query.value.trim().length > 0);

function onInput() {
  emit('search', query.value);
  cursor.value = 0;
  open.value = query.value.trim().length > 0;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    open.value = false;
    inputRef.value?.blur();
    return;
  }
  if (props.results.length === 0) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    cursor.value = (cursor.value + 1) % props.results.length;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    cursor.value = (cursor.value - 1 + props.results.length) % props.results.length;
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const game = props.results[cursor.value];
    if (game) commit(game);
  }
}

watch(cursor, async () => {
  await nextTick();
  const row = listRef.value?.children[cursor.value] as HTMLElement | undefined;
  row?.scrollIntoView({ block: 'nearest' });
});

/** Adds the game, then resets the field so the next search starts clean. */
function commit(game: Game) {
  emit('add', game);
  query.value = '';
  cursor.value = 0;
  open.value = false;
  emit('search', '');
  inputRef.value?.blur();
}
</script>

<template>
  <div
    ref="rootRef"
    class="relative w-full"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <div
      class="search-box panel flex items-center gap-3 ps-3 pe-2 transition-colors duration-150"
      :class="open ? 'border-accent' : ''"
    >
      <Icon name="search" :size="17" class="flex-none text-faint" />

      <div class="relative min-w-0 flex-1">
        <input
          ref="inputRef"
          data-search-input
          v-model="query"
          type="text"
          spellcheck="false"
          autocomplete="off"
          placeholder=" "
          class="w-full border-0 bg-transparent pt-4 pb-1 text-[14px] font-medium text-ink outline-none placeholder-transparent"
          @input="onInput"
          @focus="
            focused = true;
            open = query.trim().length > 0;
          "
          @blur="focused = false"
          @keydown="onKeydown"
        />
        <label class="search-label pointer-events-none absolute" :class="{ 'is-raised': raised, 'is-focused': focused }">
          {{ placeholder }}
        </label>
      </div>

      <!-- live cover preview of the highlighted result -->
      <div
        v-if="preview && open"
        class="h-8 w-14 flex-none overflow-hidden rounded-md shadow-[inset_0_0_0_1px_rgba(0,0,0,0.28)] fade-up"
      >
        <GameArt :game="preview" />
      </div>

      <slot name="trailing" />
    </div>

    <!-- results -->
    <Transition name="pop">
      <div
        v-if="open && (results.length > 0 || loading)"
        ref="listRef"
        class="panel absolute inset-x-0 top-full z-50 mt-2 max-h-80 overflow-y-auto p-1"
      >
        <button
          v-for="(game, index) in results"
          :key="game.id"
          class="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-start transition-colors"
          :class="index === cursor ? 'bg-accent-soft' : 'hover:bg-ink/5'"
          @mouseenter="cursor = index"
          @click="commit(game)"
        >
          <span class="h-9 w-16 flex-none overflow-hidden rounded-md shadow-[inset_0_0_0_1px_rgba(0,0,0,0.28)]">
            <GameArt :game="game" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13px] font-medium text-ink">{{ game.name }}</span>
            <span class="block truncate text-[11px] text-faint">
              {{ t('home.gameId') }} · {{ game.id }}
              <template v-if="game.executables.length"> · {{ game.executables[0].name }}</template>
            </span>
          </span>
          <span class="chip flex-none" :class="index === cursor ? 'bg-accent text-accent-ink' : ''">
            <Icon name="plus" :size="12" />
            {{ t('common.add') }}
          </span>
        </button>

        <div v-if="loading" class="flex items-center gap-2 px-3 py-2 text-[12px] text-faint">
          <Icon name="spinner" :size="13" class="spin" />
          {{ t('common.loading') }}
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.search-label {
  inset-inline-start: 0;
  top: 50%;
  transform: translateY(-50%);
  font-size: 13.5px;
  color: var(--color-muted);
  transition:
    top 0.18s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
    font-size 0.18s ease,
    letter-spacing 0.18s ease,
    color 0.15s ease;
}

/* lifted state: hover anywhere inside the box, focus, or field has text —
   the hover/focus half is pure CSS so it reacts the instant the pointer
   enters, no matter how the events arrive */
.search-label.is-raised,
.search-box:hover .search-label,
.search-box:focus-within .search-label {
  top: 5px;
  transform: translateY(0);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.search-label.is-focused {
  color: var(--color-accent);
}
</style>
