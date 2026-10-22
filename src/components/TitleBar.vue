<script setup lang="ts">
import { computed, ref } from 'vue';
import BrandLogo from './BrandLogo.vue';
import Icon from './ui/Icon.vue';
import { Pages, useGlobalState } from '@/composables/app-state';
import { useI18n, formatClock } from '@/composables/i18n';
import { useQueue } from '@/composables/queue';
import { isTauri } from '@/composables/rpc';

const { page, setPage } = useGlobalState();
const { t } = useI18n();
const queue = useQueue();

const maximized = ref(false);

const navItems = computed(() => [
  { key: Pages.HOME, label: t('nav.games'), icon: 'games', badge: 0 },
  { key: Pages.QUEUE, label: t('nav.queue'), icon: 'queue', badge: queue.entries.length },
  { key: Pages.SETTINGS, label: t('nav.settings'), icon: 'settings', badge: 0 },
]);

async function windowAction(action: 'minimize' | 'toggle-maximize' | 'close') {
  if (!isTauri) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    if (action === 'minimize') {
      await win.minimize();
    } else if (action === 'toggle-maximize') {
      await win.toggleMaximize();
      maximized.value = await win.isMaximized();
    } else {
      await win.close();
    }
  } catch (error) {
    console.warn('window control failed', error);
  }
}

/**
 * Frameless windows need an explicit drag handle. Interactive children bail out
 * early so nav pills and window buttons keep behaving like buttons; the second
 * click of a double click toggles the maximized state instead.
 */
async function onTitlebarMousedown(event: MouseEvent) {
  if (!isTauri || event.button !== 0) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('button, input, a, [data-no-drag]')) return;

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    if (event.detail === 2) {
      await win.toggleMaximize();
      maximized.value = await win.isMaximized();
    } else {
      await win.startDragging();
    }
  } catch (error) {
    console.warn('drag failed', error);
  }
}
</script>

<template>
  <header
    class="chrome relative z-30 flex h-11 flex-none items-center gap-1 border-b border-line ps-2 pe-1"
    @mousedown="onTitlebarMousedown"
  >
    <!-- brand -->
    <div class="flex items-center gap-2 pe-3">
      <BrandLogo :size="29" />
      <span class="text-[14.5px] font-semibold tracking-tight text-ink">Playfy</span>
    </div>

    <span class="me-2 h-5 w-px bg-line"></span>

    <!-- navigation: classic flat tabs with a single accent underline -->
    <nav class="flex h-full items-center gap-0.5">
      <button
        v-for="item in navItems"
        :key="item.key"
        class="group relative flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors"
        :class="
          page === item.key
            ? 'text-ink after:absolute after:inset-x-2 after:-bottom-[9px] after:h-[2px] after:rounded-full after:bg-accent'
            : 'text-muted hover:bg-ink/[0.055] hover:text-ink'
        "
        @click="setPage(item.key)"
      >
        <Icon :name="item.icon" :size="16" :class="page === item.key ? 'text-accent' : ''" />
        <span>{{ item.label }}</span>
        <span
          v-if="item.badge > 0"
          class="rounded-full bg-accent px-1.5 text-[10px] font-bold leading-[16px] text-accent-ink"
        >
          {{ item.badge }}
        </span>
      </button>
    </nav>

    <div class="flex-1"></div>

    <!-- live rotation status -->
    <div
      v-if="queue.running && queue.current"
      class="me-2 hidden items-center gap-2 rounded-lg border border-line bg-ink/[0.05] px-2.5 py-1 text-[12px] text-muted sm:flex"
    >
      <span class="relative flex h-2 w-2">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60"></span>
        <span class="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
      </span>
      <span class="max-w-40 truncate text-ink">{{ queue.current.game.name }}</span>
      <span class="font-mono text-faint">{{ formatClock(queue.remainingSec) }}</span>
    </div>

    <!-- window controls -->
    <div v-if="isTauri" class="ms-1 flex items-center">
      <button
        class="flex h-8 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-ink/8 hover:text-ink"
        :title="t('titlebar.minimize')"
        @click="windowAction('minimize')"
      >
        <Icon name="minimize" :size="16" />
      </button>
      <button
        class="flex h-8 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-ink/8 hover:text-ink"
        :title="maximized ? t('titlebar.restore') : t('titlebar.maximize')"
        @click="windowAction('toggle-maximize')"
      >
        <Icon :name="maximized ? 'restore' : 'maximize'" :size="14" />
      </button>
      <button
        class="flex h-8 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger hover:text-white"
        :title="t('titlebar.close')"
        @click="windowAction('close')"
      >
        <Icon name="x" :size="16" />
      </button>
    </div>
  </header>
</template>
