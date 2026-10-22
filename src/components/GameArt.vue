<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { artCandidates, fallbackHue } from '@/composables/game-art';
import type { Game } from '@/types/types';

const props = defineProps<{ game: Game | null | undefined }>();

const attempt = ref(0);
const exhausted = ref(false);

watch(
  () => props.game?.id,
  () => {
    attempt.value = 0;
    exhausted.value = false;
  },
);

const candidates = computed(() => (props.game ? artCandidates(props.game) : []));
const src = computed(() => candidates.value[attempt.value] ?? null);

function handleError() {
  if (attempt.value < candidates.value.length - 1) {
    attempt.value++;
  } else {
    exhausted.value = true;
  }
}

const hue = computed(() => fallbackHue(props.game?.id ?? 'Playfy'));
const initial = computed(() => (props.game?.name?.trim().charAt(0) ?? '?').toUpperCase());
</script>

<template>
  <img
    v-if="src && !exhausted"
    :key="src"
    :src="src"
    loading="lazy"
    decoding="async"
    alt=""
    class="h-full w-full object-cover"
    draggable="false"
    @error="handleError"
  />
  <div
    v-else
    class="flex h-full w-full items-center justify-center font-semibold text-white/90"
    :style="{
      background: `linear-gradient(140deg, hsl(${hue} 58% 46%), hsl(${(hue + 42) % 360} 64% 26%))`,
    }"
  >
    <span class="leading-none">{{ initial }}</span>
  </div>
</template>
