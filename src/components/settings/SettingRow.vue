<script setup lang="ts">
defineProps<{ label: string; hint?: string }>();
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2.5">
    <div class="flex min-w-0 flex-col">
      <span class="text-[13px] font-medium text-ink">{{ label }}</span>
      <span v-if="hint" class="text-[11.5px] leading-snug text-faint">{{ hint }}</span>
    </div>
    <div class="flex flex-none items-center gap-2">
      <slot />
    </div>
  </div>
</template>
