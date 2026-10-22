<script setup lang="ts">
defineProps<{ label: string; hint?: string; modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2.5">
    <div class="flex min-w-0 flex-col">
      <span class="text-[13px] font-medium text-ink">{{ label }}</span>
      <span v-if="hint" class="text-[11.5px] leading-snug text-faint">{{ hint }}</span>
    </div>
    <button
      class="switch"
      role="switch"
      :aria-checked="modelValue"
      @click="emit('update:modelValue', !modelValue)"
    ></button>
  </div>
</template>
