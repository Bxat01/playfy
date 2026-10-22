<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    label: string;
    hint?: string;
    modelValue: number;
    min: number;
    max: number;
    step?: number;
    /** render 0-1 style values as a percentage instead of a raw fraction */
    percent?: boolean;
    /** appended to the readout, e.g. "px" */
    suffix?: string;
  }>(),
  { step: 0.01 },
);

const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

const display = computed(() => {
  if (props.percent) return String(Math.round(props.modelValue * 100));
  const decimals = props.step >= 1 ? 0 : props.step >= 0.1 ? 1 : 2;
  return String(Number(props.modelValue.toFixed(decimals)));
});
</script>

<template>
  <div class="py-2.5">
    <div class="mb-1.5 flex items-center justify-between gap-4">
      <span class="text-[13px] font-medium text-ink">{{ label }}</span>
      <span class="font-mono text-[12px] text-muted">{{ display }}{{ percent ? '%' : suffix }}</span>
    </div>
    <input
      type="range"
      class="w-full"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    />
    <p v-if="hint" class="mt-1 text-[11.5px] leading-snug text-faint">{{ hint }}</p>
  </div>
</template>
