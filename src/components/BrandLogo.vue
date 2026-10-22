<script setup lang="ts">
/**
 * Playfy mark: the colourful keycap artwork that also ships as the window and
 * taskbar icon. Keeping it in `public/` means the title bar never waits on an
 * extra network request.
 */
withDefaults(defineProps<{ size?: number }>(), {
  size: 24,
});
</script>

<template>
  <img
    src="/playfy-logo.png"
    alt="Playfy"
    :width="size"
    :height="size"
    class="select-none object-contain drop-shadow-[0_2px_10px_rgba(124,58,237,0.35)]"
    draggable="false"
  />
</template>
