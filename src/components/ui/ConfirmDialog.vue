<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { useI18n } from '@/composables/i18n';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    body?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    icon?: string;
  }>(),
  {
    body: '',
    confirmLabel: '',
    cancelLabel: '',
    danger: false,
    icon: 'info',
  },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();
const { t } = useI18n();

function onKey(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('cancel');
  } else if (event.key === 'Enter') {
    event.preventDefault();
    emit('confirm');
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKey, true);
    else window.removeEventListener('keydown', onKey, true);
  },
  { immediate: true },
);

onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true));
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      leave-active-class="transition-opacity duration-100"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
        @click.self="emit('cancel')"
      >
        <div class="panel-elevated fade-up w-full max-w-md p-5" role="dialog" aria-modal="true">
          <h3 class="mb-2 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Icon :name="icon" :size="16" :class="danger ? 'text-danger' : 'text-warning'" />
            {{ title }}
          </h3>
          <p v-if="body" class="mb-4 whitespace-pre-line text-[13px] leading-relaxed text-muted">{{ body }}</p>
          <div class="flex justify-end gap-2">
            <button class="btn" @click="emit('cancel')">{{ cancelLabel || t('common.cancel') }}</button>
            <button class="btn" :class="danger ? 'btn-danger' : 'btn-accent'" @click="emit('confirm')">
              {{ confirmLabel || t('common.yes') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
