<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import Icon from './Icon.vue';
import {
  closeContextMenu,
  contextMenu,
  selectContextItem,
} from '@/composables/context-menu';

/**
 * The single right-click menu instance. Views feed it items through
 * `openContextMenu()`; it closes on Escape, on any click outside of itself,
 * and after an item is picked.
 */
function onPointerDown(event: MouseEvent) {
  if (!contextMenu.open) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('.ctx-menu')) return;
  closeContextMenu();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeContextMenu();
}

onMounted(() => {
  window.addEventListener('mousedown', onPointerDown, true);
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('blur', closeContextMenu);
});

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onPointerDown, true);
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('blur', closeContextMenu);
});
</script>

<template>
  <Transition name="pop">
    <div
      v-if="contextMenu.open"
      class="ctx-menu panel-elevated fixed z-50 w-52 overflow-hidden p-1"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @contextmenu.prevent
    >
      <button
        v-for="item in contextMenu.items"
        :key="item.key"
        class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-start text-[12.5px] font-medium transition-colors"
        :class="
          item.disabled
            ? 'cursor-default text-faint opacity-60'
            : item.danger
              ? 'text-danger hover:bg-danger/15'
              : 'text-ink hover:bg-ink/8'
        "
        :disabled="item.disabled"
        @click="selectContextItem(item.key)"
      >
        <Icon v-if="item.icon" :name="item.icon" :size="14" class="flex-none opacity-80" />
        <span class="truncate">{{ item.label }}</span>
      </button>
    </div>
  </Transition>
</template>
