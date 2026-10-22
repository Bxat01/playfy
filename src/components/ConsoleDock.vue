<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import Icon from './ui/Icon.vue';
import { useGlobalState } from '@/composables/app-state';
import { useI18n, formatClock } from '@/composables/i18n';
import { useQueue } from '@/composables/queue';
import { useSettings } from '@/composables/settings';

const { t } = useI18n();
const { liveSession, consoleExpanded } = useGlobalState();
const queue = useQueue();
const { settings } = useSettings();

const logRef = ref<HTMLElement | null>(null);

watch(
  () => queue.logs.length,
  async () => {
    if (!consoleExpanded.value) return;
    await nextTick();
    logRef.value?.scrollTo({ top: logRef.value.scrollHeight });
  },
);

watch(consoleExpanded, async (open) => {
  if (!open) return;
  await nextTick();
  logRef.value?.scrollTo({ top: logRef.value.scrollHeight });
});

const levelClass: Record<string, string> = {
  info: 'text-muted',
  ok: 'text-success',
  warn: 'text-warning',
  error: 'text-danger',
};
</script>

<template>
  <div
    v-if="settings.showConsole"
    class="chrome relative z-20 flex-none border-t border-line shadow-[0_-18px_48px_-34px_rgba(0,0,0,0.95)]"
  >
    <!-- expanded terminal -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="max-h-0 opacity-0"
      enter-to-class="max-h-64 opacity-100"
      leave-from-class="max-h-64 opacity-100"
      leave-to-class="max-h-0 opacity-0"
    >
      <div v-show="consoleExpanded" class="overflow-hidden border-b border-line">
        <div class="flex items-center justify-between px-3 py-1.5">
          <span class="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-faint">
            <Icon name="terminal" :size="13" />
            {{ t('console.label') }}
          </span>
          <button class="btn btn-ghost !px-2 !py-0.5 text-[11.5px]" @click="queue.clearLogs()">
            {{ t('console.clear') }}
          </button>
        </div>
        <div ref="logRef" class="h-52 overflow-y-auto px-3 pb-2 font-mono text-[11.5px] leading-5">
          <div v-if="queue.logs.length === 0" class="text-faint">{{ t('console.empty') }}</div>
          <div v-for="line in queue.logs" :key="line.id" class="flex gap-2">
            <span class="text-faint">{{ line.at }}</span>
            <span :class="levelClass[line.level]">{{ line.message }}</span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- status strip -->
    <div class="flex h-9 items-center gap-3 px-3 text-[12px]">
      <span
        class="flex items-center gap-1.5 font-medium"
        :class="queue.running || liveSession ? 'text-success' : 'text-faint'"
      >
        <span
          class="h-1.5 w-1.5 rounded-full"
          :class="queue.running || liveSession ? 'bg-success' : 'bg-faint'"
        ></span>
        {{ queue.running ? t('status.running') : liveSession ? t('status.playing') : t('status.idle') }}
      </span>

      <template v-if="queue.running && queue.current">
        <span class="truncate font-medium text-ink">{{ queue.current.game.name }}</span>
        <span class="font-mono text-muted">{{ formatClock(queue.elapsedSec) }}</span>
        <div class="h-1 min-w-24 flex-1 overflow-hidden rounded-full bg-ink/10">
          <div
            class="h-full rounded-full bg-accent transition-[width] duration-500 ease-linear"
            :style="{ width: `${Math.round(queue.progress * 100)}%` }"
          ></div>
        </div>
        <span class="font-mono text-muted">{{ formatClock(queue.remainingSec) }}</span>
        <span class="hidden text-faint lg:inline">
          {{ t('status.nextLabel') }}: <span class="text-muted">{{ queue.next?.game.name ?? '—' }}</span>
        </span>
      </template>

      <template v-else-if="liveSession">
        <span class="truncate font-medium text-ink">{{ liveSession.name }}</span>
      </template>

      <span v-else class="text-faint">{{ t('queue.idleHint') }}</span>

      <div class="ms-auto flex items-center gap-1">
        <button
          v-if="queue.running"
          class="btn btn-ghost !px-2 !py-1"
          :title="queue.paused ? t('queue.resume') : t('queue.pause')"
          @click="queue.paused ? queue.resume() : queue.pause()"
        >
          <Icon :name="queue.paused ? 'play' : 'pause'" :size="13" />
        </button>
        <button
          class="btn btn-ghost !px-2 !py-1"
          :title="consoleExpanded ? t('console.collapse') : t('console.expand')"
          @click="consoleExpanded = !consoleExpanded"
        >
          <Icon :name="consoleExpanded ? 'chevronDown' : 'chevronUp'" :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>
