<script setup lang="ts">
import { shallowRef, watch, watchEffect } from 'vue';
import TitleBar from './TitleBar.vue';
import ConsoleDock from './ConsoleDock.vue';
import ContextMenu from './ui/ContextMenu.vue';
import { useSettings } from '@/composables/settings';
import { useI18n } from '@/composables/i18n';
import { useShortcuts } from '@/composables/shortcuts';

const { settings } = useSettings();
const { direction, language } = useI18n();

// Global keyboard shortcuts live for the whole shell, not just one page.
useShortcuts().install();

// Keep the document in sync so logical CSS properties (ms-, me-, start-, end-)
// mirror correctly for right-to-left languages.
watchEffect(() => {
  document.documentElement.dir = direction.value;
  document.documentElement.lang = language.value;
});

/* ---------------------------------------------------------------- wallpaper
 * Two stacked layers crossfade whenever the background changes: the new image
 * is preloaded on a hidden layer, fades in on top, then the old layer is
 * dropped. Slider tweaks (opacity / blur / dim) animate through CSS
 * transitions instead — nothing ever pops into place.
 *
 * Picks race while browsing the gallery: every click starts its own image
 * probe which finishes whenever the network answers. Two rules keep that
 * safe — a stale probe never adds its layer, and cleanup always keeps the
 * NEWEST layer, so an older crossfade can never evict (and blank out) a
 * newer background that arrived while it was still fading.               */
interface WallLayer {
  id: number;
  url: string;
  shown: boolean;
}

const wallLayers = shallowRef<WallLayer[]>([]);
let layerSeq = 0;
let requestSeq = 0;

watch(
  () => (settings.background.enabled ? settings.background.url : ''),
  (url) => {
    if (!url) {
      wallLayers.value = [];
      return;
    }
    // already showing this exact image
    if (wallLayers.value.some((layer) => layer.url === url && layer.shown)) return;

    const requestId = ++requestSeq;
    const id = ++layerSeq;
    const probe = new Image();
    probe.onload = () => {
      if (requestId !== requestSeq) return; // superseded by a newer pick
      wallLayers.value = [...wallLayers.value, { id, url, shown: false }];

      // Flip the new layer on. Two rAFs guarantee the browser painted the
      // hidden state first (so the crossfade actually animates); the timeout
      // is a safety net for when animation frames are throttled (minimized
      // window) — it keeps the background showing even without the fade.
      const reveal = () => {
        wallLayers.value = wallLayers.value.map((layer) =>
          layer.id === id ? { ...layer, shown: true } : layer,
        );
      };
      requestAnimationFrame(() => requestAnimationFrame(reveal));
      window.setTimeout(reveal, 150);
      window.setTimeout(() => {
        // drop everything except the NEWEST layer — a newer crossfade may
        // have started while this one was running and must survive cleanup
        const newest = wallLayers.value.reduce((max, layer) => Math.max(max, layer.id), id);
        wallLayers.value = wallLayers.value.filter((layer) => layer.id === newest);
      }, 900);
    };
    probe.onerror = () => {
      /* bad URL — keep the previous background instead of flashing a broken layer */
    };
    probe.src = url;
  },
  { immediate: true },
);
</script>

<template>
  <div class="relative flex h-full flex-col overflow-hidden">
    <div v-if="settings.background.enabled" class="wallpaper">
      <div
        v-for="layer in wallLayers"
        :key="layer.id"
        class="wallpaper__image"
        :class="{ 'is-shown': layer.shown }"
        :style="{ backgroundImage: `url('${layer.url}')` }"
      ></div>
      <div class="wallpaper__dim"></div>
      <div class="wallpaper__vignette"></div>
    </div>

    <TitleBar />

    <!-- The console is part of the column flow, not an overlay. Reserving its
         real height here means the page viewport shrinks with the drawer and
         every search result, queue row and card stays reachable. -->
    <main class="app-scroll relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      <slot />
    </main>

    <ConsoleDock />
    <ContextMenu />
  </div>
</template>
