<template>
  <div class="flex flex-col gap-2">
    <h3 class="text-[11.5px] font-semibold uppercase tracking-wider text-faint">
      {{ t('home.executables') }}
    </h3>

    <p v-if="isMac" class="text-[11.5px] leading-relaxed text-faint">
      {{ t('home.macNote') }}
    </p>

    <p v-if="usingCrossPlatformFallback" class="text-[11.5px] text-warning">
      {{ t('home.fallbackOs') }}
    </p>

    <p v-if="filteredExecutables.length === 0" class="text-[12px] text-warning">
      {{ t('home.noExecutables') }}
    </p>

    <div
      v-for="executable in filteredExecutables"
      :key="executable.name"
      class="flex items-center gap-2 rounded-xl border border-line bg-ink/[0.03] px-2.5 py-2"
    >
      <span class="chip flex-none font-mono">{{ executable.os }}</span>

      <!-- path sections fade out when they overflow -->
      <div class="relative min-w-0 flex-1 overflow-hidden">
        <div class="flex flex-nowrap items-center gap-1 overflow-x-auto scroll-none pr-4 fade-right">
          <span
            v-for="(section, i) in splitExecutableName(executable)"
            :key="i"
            class="whitespace-nowrap rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted"
          >
            {{ section }}
          </span>
        </div>
      </div>

      <button
        class="btn flex-none !px-2.5 !py-1"
        :class="gameActions?.isExecutableRunning(executable) ? 'btn-danger' : 'btn-accent'"
        :disabled="executable.os !== currentPlatform"
        :title="executable.os !== currentPlatform ? t('home.fallbackOs') : undefined"
        @click="handleLaunch(executable)"
      >
        <Icon :name="gameActions?.isExecutableRunning(executable) ? 'stop' : 'play'" :size="12" />
        {{ gameActions?.isExecutableRunning(executable) ? t('home.stop') : t('home.play') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { EXECUTABLE_OS, GameActionsKey, getCurrentOS, isMacOS } from '@/constants/constants';
import { useI18n } from '@/composables/i18n';
import { decorateExecutable, splitExecutableName } from '@/composables/executables';
import type { GameActionsProvider, Game, GameExecutable } from '@/types/types';

const props = defineProps<{
  game: Game;
}>();

const emit = defineEmits<{
  play: [{ game: Game; executable: GameExecutable }];
  stop: [{ game: Game; executable: GameExecutable }];
  install_and_play: [{ game: Game; executable: GameExecutable }];
}>();

const { t } = useI18n();
const gameActions = inject<GameActionsProvider>(GameActionsKey);
const currentPlatform = getCurrentOS();
const isMac = isMacOS();

function isValidPath(name: string) {
  const illegalChars = ['>', '<', ':', '"', '|', '?', '*'];
  return !illegalChars.some((char) => name.includes(char));
}

const validExecutables = computed(() =>
  props.game.executables.filter((executable) => isValidPath(executable.name)),
);

const filteredExecutables = computed(() => {
  const platformMatches = validExecutables.value.filter(
    (executable) => executable.os === currentPlatform,
  );
  return platformMatches.length > 0 ? platformMatches : validExecutables.value;
});

const usingCrossPlatformFallback = computed(() => {
  if (validExecutables.value.length === 0) return false;
  return !validExecutables.value.some((executable) => executable.os === currentPlatform);
});

function handleLaunch(executable: GameExecutable) {
  if (executable.os !== currentPlatform) return;

  // Keep the derived fields on the row object itself. The session handlers set
  // `is_running`/`is_installed` on this object, so a detached copy would leave
  // the Play button saying "Play" after the game had already started.
  decorateExecutable(executable);

  if (executable.is_running) {
    emit('stop', { game: props.game, executable });
  } else if (!gameActions?.isGameExecutableInstalled(executable)) {
    emit('install_and_play', { game: props.game, executable });
  } else {
    emit('play', { game: props.game, executable });
  }
}
</script>

<style scoped>
.fade-right {
  -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%);
  mask-image: linear-gradient(to right, black 85%, transparent 100%);
}

.scroll-none {
  scrollbar-width: none;
}
.scroll-none::-webkit-scrollbar {
  display: none;
}
</style>
