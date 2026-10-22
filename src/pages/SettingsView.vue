<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import BrandLogo from '@/components/BrandLogo.vue';
import Icon from '@/components/ui/Icon.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import SettingRow from '@/components/settings/SettingRow.vue';
import SliderRow from '@/components/settings/SliderRow.vue';
import SwitchRow from '@/components/settings/SwitchRow.vue';
import { useGlobalState } from '@/composables/app-state';
import { LANGUAGES, useI18n } from '@/composables/i18n';
import {
  ACCENT_PRESETS,
  FONT_OPTIONS,
  NIGHT_PALETTES,
  useSettings,
  type NightPalette,
} from '@/composables/settings';
import { useMyGames } from '@/composables/my-games';
import { useQueue } from '@/composables/queue';
import { comboFromEvent, useShortcuts } from '@/composables/shortcuts';
import { formatClock } from '@/composables/i18n';
import {
  applyBackup,
  exportBackup,
  parseBackup,
  pickBackupFile,
  type ParsedBackup,
} from '@/composables/backup';
import { isTauri } from '@/composables/rpc';
import pkg from '../../package.json';

const { settings, reset, wallpapers } = useSettings();
const { t } = useI18n();
const { addLog } = useGlobalState();
const myGames = useMyGames();
const queue = useQueue();
const shortcuts = useShortcuts();
const shortcutList = shortcuts.list;

const section = ref<
  'general' | 'appearance' | 'backgrounds' | 'language' | 'shortcuts' | 'data' | 'developer' | 'about'
>('appearance');

const sections = [
  { key: 'general', label: 'settings.general', icon: 'settings' },
  { key: 'appearance', label: 'settings.appearance', icon: 'palette' },
  { key: 'backgrounds', label: 'settings.backgrounds', icon: 'image' },
  { key: 'language', label: 'settings.language', icon: 'globe' },
  { key: 'shortcuts', label: 'settings.shortcuts', icon: 'terminal' },
  { key: 'data', label: 'settings.data', icon: 'trash' },
  { key: 'developer', label: 'settings.developer', icon: 'developer' },
  { key: 'about', label: 'settings.about', icon: 'info' },
] as const;

const nightKeys = Object.keys(NIGHT_PALETTES) as NightPalette[];

const paletteKeys: Record<NightPalette, string> = {
  onyx: 'settings.onyx',
  dark: 'settings.dark',
  ash: 'settings.ash',
};
const paletteHints: Record<NightPalette, string> = {
  onyx: 'settings.onyxHint',
  dark: 'settings.darkHint',
  ash: 'settings.ashHint',
};

const customUrl = ref('');

function pickWallpaper(url: string, id: string) {
  settings.background.url = url;
  settings.background.id = id;
}

function applyCustomUrl() {
  const url = customUrl.value.trim();
  if (!/^https?:\/\//.test(url)) return;
  pickWallpaper(url, 'custom');
}

function chooseFont(value: string) {
  settings.font = value;
}

/* ------------------------------------------------------- destructive actions */

type ConfirmKind = 'reset' | 'games' | 'queue' | 'cache' | 'import' | null;
const confirmKind = ref<ConfirmKind>(null);
const importInput = ref<HTMLInputElement | null>(null);
const pendingImport = ref<ParsedBackup | null>(null);
const transferBusy = ref(false);
const transferMessage = ref<string | null>(null);

const confirmCopy = computed(() => {
  switch (confirmKind.value) {
    case 'reset':
      return {
        title: t('settings.resetAll'),
        body: t('settings.resetConfirm'),
        label: t('common.reset'),
        icon: 'refresh',
      };
    case 'games':
      return {
        title: t('settings.clearGamesTitle'),
        body: t('settings.clearGamesBody'),
        label: t('settings.confirmClear'),
        icon: 'trash',
      };
    case 'queue':
      return {
        title: t('settings.clearQueueTitle'),
        body: t('settings.clearQueueBody'),
        label: t('settings.confirmClear'),
        icon: 'trash',
      };
    case 'cache':
      return {
        title: t('settings.clearCacheTitle'),
        body: t('settings.clearCacheBody'),
        label: t('settings.confirmClear'),
        icon: 'refresh',
      };
    case 'import':
      return {
        title: t('settings.importConfirmTitle'),
        body: t('settings.importConfirmBody'),
        label: t('settings.confirmImport'),
        icon: 'arrowDown',
      };
    default:
      return { title: '', body: '', label: '', icon: 'info' };
  }
});

function resetEverything() {
  confirmKind.value = 'reset';
}

async function runExport() {
  if (transferBusy.value) return;
  transferBusy.value = true;
  transferMessage.value = null;
  try {
    const path = await exportBackup();
    if (path) {
      transferMessage.value = t('settings.exportDone');
      addLog('info', `settings exported to ${path}`);
    }
  } catch (error) {
    transferMessage.value = t('settings.exportFailed');
    addLog('error', `settings export failed: ${String(error)}`);
  } finally {
    transferBusy.value = false;
  }
}

function acceptImport(parsed: ParsedBackup) {
  pendingImport.value = parsed;
  confirmKind.value = 'import';
}

async function runImport() {
  if (transferBusy.value) return;
  transferBusy.value = true;
  transferMessage.value = null;
  try {
    if (!isTauri) {
      importInput.value?.click();
      return;
    }
    const parsed = await pickBackupFile();
    if (parsed) acceptImport(parsed);
  } catch (error) {
    transferMessage.value = t('settings.importFailed');
    addLog('error', `settings import failed: ${String(error)}`);
  } finally {
    transferBusy.value = false;
  }
}

async function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    if (file.size > 4 * 1024 * 1024) throw new Error('This backup is too large.');
    acceptImport(parseBackup(await file.text(), file.name));
  } catch (error) {
    transferMessage.value = t('settings.importFailed');
    addLog('error', `settings import failed: ${String(error)}`);
  }
}

function runConfirmedAction() {
  const kind = confirmKind.value;
  confirmKind.value = null;

  if (kind === 'import') {
    if (!pendingImport.value) return;
    try {
      applyBackup(pendingImport.value.payload);
      addLog('info', t('settings.importDone'));
      window.setTimeout(() => window.location.reload(), 160);
    } catch (error) {
      transferMessage.value = t('settings.importFailed');
      addLog('error', `settings import failed: ${String(error)}`);
    } finally {
      pendingImport.value = null;
    }
    return;
  }

  if (kind === 'reset') {
    reset();
    addLog('info', 'settings reset to defaults');
  } else if (kind === 'games') {
    myGames.clear();
    addLog('info', t('settings.gamesCleared'));
  } else if (kind === 'queue') {
    queue.clearQueue();
    addLog('info', t('settings.queueCleared'));
  } else if (kind === 'cache') {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* nothing else to clear */
    }
    addLog('info', t('settings.cacheCleared'));
    window.setTimeout(() => window.location.reload(), 120);
  }
}

/* ------------------------------------------------------------ shortcuts */

const capturingAction = ref<string | null>(null);

function beginCapture(action: string, event: MouseEvent) {
  // Blur the button first: otherwise Enter/Space would trigger it again while
  // the listener is waiting for the new combo.
  (event.currentTarget as HTMLElement).blur();
  endCapture();
  capturingAction.value = action;
  shortcuts.capturing.value = true;
  window.addEventListener('keydown', onCaptureKey, true);
}

function endCapture() {
  capturingAction.value = null;
  shortcuts.capturing.value = false;
  window.removeEventListener('keydown', onCaptureKey, true);
}

function onCaptureKey(event: KeyboardEvent) {
  if (!capturingAction.value) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  if (event.code === 'Escape') {
    endCapture();
    return;
  }
  // Wait for the actual key, not the modifier that starts the combo.
  if (/^(Control|Shift|Alt|Meta)(Left|Right)$/.test(event.code)) return;

  shortcuts.setBinding(capturingAction.value, comboFromEvent(event));
  endCapture();
}

function onResetRequest() {
  section.value = 'data';
  confirmKind.value = 'reset';
}

onMounted(() => window.addEventListener('playfy:reset-settings', onResetRequest as EventListener));
onBeforeUnmount(() => {
  window.removeEventListener('playfy:reset-settings', onResetRequest as EventListener);
  endCapture();
});
</script>

<template>
  <div class="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-6 lg:flex-row lg:items-start">
    <!-- section nav -->
    <aside class="panel sticky top-4 flex w-full flex-none flex-row flex-wrap gap-1 p-1.5 lg:w-52 lg:flex-col">
      <div class="px-2.5 py-2">
        <h1 class="text-[14px] font-semibold text-ink">{{ t('settings.title') }}</h1>
        <p class="mt-0.5 hidden text-[11px] leading-snug text-faint lg:block">
          {{ t('settings.subtitle') }}
        </p>
      </div>
      <button
        v-for="item in sections"
        :key="item.key"
        class="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition-colors"
        :class="section === item.key ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-ink/5 hover:text-ink'"
        @click="section = item.key"
      >
        <Icon :name="item.icon" :size="15" :class="section === item.key ? 'text-accent' : ''" />
        {{ t(item.label) }}
      </button>
    </aside>

    <!-- panels: min-height keeps the column from collapsing to zero during the
         out-in transition, so the sidebar and scrollbar never jump around -->
    <div class="flex min-h-[460px] min-w-0 flex-1 flex-col gap-4">
      <Transition name="page" mode="out-in">
        <!-- GENERAL -->
        <section v-if="section === 'general'" key="general" class="panel p-5">
        <h2 class="mb-3 text-[15px] font-semibold text-ink">{{ t('settings.general') }}</h2>

        <SwitchRow
          v-model="settings.showConsole"
          :label="t('settings.showConsole')"
          :hint="t('settings.showConsoleHint')"
        />

        <SliderRow
          v-model="settings.defaultInterval"
          :label="t('settings.defaultInterval')"
          :hint="t('settings.defaultIntervalHint')"
          :min="60"
          :max="3600"
          :step="60"
          :suffix="` · ${formatClock(settings.defaultInterval)}`"
        />

        <div class="mt-4 border-t border-line pt-4">
          <SettingRow :label="t('settings.resetAll')" :hint="t('settings.resetAllHint')">
            <button class="btn btn-danger" @click="resetEverything">
              <Icon name="refresh" :size="14" />
              {{ t('common.reset') }}
            </button>
          </SettingRow>
        </div>
      </section>

      <!-- APPEARANCE -->
      <section v-else-if="section === 'appearance'" key="appearance" class="panel p-5">
        <h2 class="mb-3 text-[15px] font-semibold text-ink">{{ t('settings.appearance') }}</h2>

        <!-- mode -->
        <SettingRow :label="t('settings.appearanceMode')">
          <div class="flex overflow-hidden rounded-lg border border-line">
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium transition-colors"
              :class="settings.mode === 'day' ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-ink/5'"
              @click="settings.mode = 'day'"
            >
              <Icon name="sun" :size="14" />
              {{ t('settings.day') }}
            </button>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium transition-colors"
              :class="settings.mode === 'night' ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-ink/5'"
              @click="settings.mode = 'night'"
            >
              <Icon name="moon" :size="14" />
              {{ t('settings.night') }}
            </button>
          </div>
        </SettingRow>

        <!-- night palettes -->
        <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2.5">
          <div class="flex flex-col">
            <span class="text-[13px] font-medium text-ink">{{ t('settings.nightPalette') }}</span>
            <span class="text-[11.5px] text-faint">{{ t(paletteHints[settings.night]) }}</span>
          </div>
          <div class="flex gap-2" :class="settings.mode === 'day' ? 'opacity-40' : ''">
            <button
              v-for="key in nightKeys"
              :key="key"
              class="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors"
              :class="
                settings.night === key && settings.mode === 'night'
                  ? 'border-accent text-ink'
                  : 'border-line text-muted hover:border-ink/25'
              "
              :disabled="settings.mode === 'day'"
              @click="settings.night = key; settings.mode = 'night'"
            >
              <span
                class="h-4 w-4 rounded-md border border-line"
                :style="{ backgroundColor: NIGHT_PALETTES[key] }"
              ></span>
              {{ t(paletteKeys[key]) }}
            </button>
          </div>
        </div>

        <!-- accent -->
        <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2.5">
          <div class="flex flex-col">
            <span class="text-[13px] font-medium text-ink">{{ t('settings.accent') }}</span>
            <span class="text-[11.5px] text-faint">{{ t('settings.accentHint') }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <button
              v-for="color in ACCENT_PRESETS"
              :key="color"
              class="h-6 w-6 rounded-lg border transition-transform hover:scale-110"
              :class="settings.accent.toLowerCase() === color.toLowerCase() ? 'border-ink ring-2 ring-offset-2 ring-offset-[rgb(var(--c-panel-rgb))] ring-ink/40' : 'border-line'"
              :style="{ backgroundColor: color }"
              @click="settings.accent = color"
            ></button>
            <input
              v-model="settings.accent"
              type="color"
              class="h-6 w-9 rounded-lg"
              :title="t('settings.accentCustom')"
            />
            <input
              v-model="settings.accent"
              type="text"
              class="field !w-24 !px-2 !py-1 font-mono text-[12px]"
            />
          </div>
        </div>

        <!-- surface -->
        <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2.5">
          <div class="flex flex-col">
            <span class="text-[13px] font-medium text-ink">{{ t('settings.surface') }}</span>
            <span class="text-[11.5px] text-faint">
              {{ settings.surface === 'glass' ? t('settings.glassHint') : t('settings.classicHint') }}
            </span>
          </div>
          <div class="flex overflow-hidden rounded-lg border border-line">
            <button
              class="px-3 py-1.5 text-[12.5px] font-medium transition-colors"
              :class="settings.surface === 'glass' ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-ink/5'"
              @click="settings.surface = 'glass'"
            >
              {{ t('settings.glass') }}
            </button>
            <button
              class="px-3 py-1.5 text-[12.5px] font-medium transition-colors"
              :class="settings.surface === 'classic' ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-ink/5'"
              @click="settings.surface = 'classic'"
            >
              {{ t('settings.classic') }}
            </button>
          </div>
        </div>

        <div v-if="settings.surface === 'glass'" class="fade-up border-t border-line pt-1">
          <SliderRow
            v-model="settings.glassBlur"
            :label="t('settings.glassBlur')"
            :min="0"
            :max="32"
            :step="1"
            suffix="px"
          />
          <SliderRow
            v-model="settings.glassOpacity"
            :label="t('settings.glassOpacity')"
            :min="0.25"
            :max="1"
            :step="0.01"
            percent
          />
        </div>

        <!-- fonts -->
        <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line py-2.5">
          <span class="text-[13px] font-medium text-ink">{{ t('settings.font') }}</span>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="font in FONT_OPTIONS"
              :key="font.id"
              class="rounded-lg border px-2.5 py-1 text-[12.5px] transition-colors"
              :class="settings.font === font.value ? 'border-accent text-ink' : 'border-line text-muted hover:border-ink/25'"
              :style="{ fontFamily: font.value }"
              @click="chooseFont(font.value)"
            >
              {{ t(font.label) }}
            </button>
          </div>
        </div>

        <!-- live preview -->
        <div class="mt-4 rounded-xl border border-line p-4" :style="{ backgroundColor: 'rgb(var(--c-app-rgb))' }">
          <p class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
            {{ t('settings.livePreview') }}
          </p>
          <div class="panel flex flex-wrap items-center gap-3 p-3">
            <span class="h-9 w-14 overflow-hidden rounded-md">
              <span
                class="block h-full w-full"
                :style="{ background: `linear-gradient(140deg, var(--c-accent), color-mix(in srgb, var(--c-accent) 40%, black))` }"
              ></span>
            </span>
            <span class="flex flex-col">
              <span class="text-[13px] font-semibold text-ink">Playfy</span>
              <span class="text-[11.5px] text-muted">{{ formatClock(settings.defaultInterval) }} · {{ t('status.running') }}</span>
            </span>
            <span class="chip">{{ t('settings.livePreview') }}</span>
            <button class="btn btn-accent ms-auto">
              <Icon name="play" :size="13" />
              {{ t('queue.start') }}
            </button>
          </div>
        </div>
      </section>

      <!-- BACKGROUNDS -->
      <section v-else-if="section === 'backgrounds'" key="backgrounds" class="panel p-5">
        <h2 class="mb-3 text-[15px] font-semibold text-ink">{{ t('settings.backgrounds') }}</h2>

        <SwitchRow
          v-model="settings.background.enabled"
          :label="t('settings.backgroundEnable')"
        />

        <div :class="settings.background.enabled ? '' : 'pointer-events-none opacity-40'">
          <div class="mb-3 mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            <button
              v-for="wallpaper in wallpapers"
              :key="wallpaper.id"
              class="relative aspect-video overflow-hidden rounded-lg border transition-transform hover:scale-[1.03]"
              :class="settings.background.id === wallpaper.id ? 'border-accent ring-1 ring-accent' : 'border-line'"
              :title="wallpaper.id"
              @click="pickWallpaper(wallpaper.full, wallpaper.id)"
            >
              <img
                :src="wallpaper.thumb"
                loading="lazy"
                decoding="async"
                alt=""
                class="h-full w-full object-cover"
                draggable="false"
              />
              <Icon
                v-if="settings.background.id === wallpaper.id"
                name="check"
                :size="14"
                class="absolute end-1 top-1 rounded-full bg-accent p-0.5 text-accent-ink"
              />
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <input
              v-model="customUrl"
              type="text"
              class="field flex-1 font-mono text-[12px]"
              :placeholder="t('settings.customUrl')"
              @keydown.enter="applyCustomUrl"
            />
            <button class="btn" @click="applyCustomUrl">{{ t('settings.applyCustom') }}</button>
          </div>

          <SliderRow v-model="settings.background.opacity" :label="t('settings.bgOpacity')" :min="0" :max="1" :step="0.01" percent />
          <SliderRow v-model="settings.background.blur" :label="t('settings.bgBlur')" :min="0" :max="40" :step="1" suffix="px" />
          <SliderRow v-model="settings.background.dim" :label="t('settings.bgDim')" :min="0" :max="0.9" :step="0.01" percent />
          <SliderRow
            v-model="settings.background.shadow"
            :label="t('settings.bgShadow')"
            :hint="t('settings.bgShadowHint')"
            :min="0"
            :max="1"
            :step="0.01"
            percent
          />
        </div>
      </section>

      <!-- LANGUAGE -->
      <section v-else-if="section === 'language'" key="language" class="panel p-5">
        <h2 class="mb-1 text-[15px] font-semibold text-ink">{{ t('settings.languageTitle') }}</h2>
        <p class="mb-4 text-[12.5px] text-muted">{{ t('settings.languageHint') }}</p>

        <div class="grid gap-2 sm:grid-cols-2">
          <button
            v-for="lang in LANGUAGES"
            :key="lang.code"
            class="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-start transition-colors"
            :class="settings.language === lang.code ? 'border-accent bg-accent-soft' : 'border-line hover:border-ink/25'"
            @click="settings.language = lang.code"
          >
            <span class="flex flex-col">
              <span class="text-[13.5px] font-semibold text-ink">{{ lang.native }}</span>
              <span class="text-[11.5px] text-faint">{{ lang.label }}</span>
            </span>
            <span class="chip" v-if="lang.dir === 'rtl'">RTL</span>
            <Icon v-else-if="settings.language === lang.code" name="check" :size="16" class="text-accent" />
          </button>
        </div>
      </section>

      <!-- SHORTCUTS -->
      <section v-else-if="section === 'shortcuts'" key="shortcuts" class="panel p-5">
        <h2 class="mb-1 text-[15px] font-semibold text-ink">{{ t('settings.shortcuts') }}</h2>
        <p class="mb-4 max-w-2xl text-[12.5px] leading-relaxed text-muted">{{ t('settings.shortcutsHint') }}</p>

        <div class="flex flex-col divide-y divide-line">
          <div
            v-for="action in shortcutList"
            :key="action.id"
            class="flex flex-wrap items-center justify-between gap-2 py-2.5"
          >
            <span class="text-[13px] font-medium text-ink">{{ t(action.label) }}</span>
            <div class="flex items-center gap-1.5">
              <span
                class="chip min-w-[110px] justify-center font-mono text-[11.5px]"
                :class="capturingAction === action.id ? 'border-accent text-accent' : !action.combo ? 'text-faint' : ''"
              >
                {{
                  capturingAction === action.id
                    ? t('settings.shortcutPress')
                    : action.display || t('settings.shortcutUnassigned')
                }}
              </span>
              <button
                class="btn !px-2.5 !py-1 text-[11.5px]"
                @click="beginCapture(action.id, $event)"
              >
                {{ t('settings.shortcutChange') }}
              </button>
            </div>
          </div>
        </div>

        <div class="mt-4 flex justify-end border-t border-line pt-4">
          <button class="btn" @click="shortcuts.resetBindings()">
            <Icon name="refresh" :size="14" />
            {{ t('settings.shortcutReset') }}
          </button>
        </div>
      </section>

      <!-- DATA & CACHE -->
      <section v-else-if="section === 'data'" key="data" class="panel p-5">
        <h2 class="mb-1 text-[15px] font-semibold text-ink">{{ t('settings.dataTitle') }}</h2>
        <p class="mb-4 max-w-2xl text-[12.5px] leading-relaxed text-muted">{{ t('settings.dataHint') }}</p>

        <div class="mb-3 grid gap-2 sm:grid-cols-2">
          <button class="btn justify-center !py-2" :disabled="transferBusy" @click="runExport">
            <Icon name="arrowUp" :size="14" />
            {{ t('settings.exportBackup') }}
          </button>
          <button class="btn justify-center !py-2" :disabled="transferBusy" @click="runImport">
            <Icon name="arrowDown" :size="14" />
            {{ t('settings.importBackup') }}
          </button>
        </div>
        <p class="mb-4 text-[11.5px] leading-relaxed text-faint">
          {{ t('settings.backupHint') }}
        </p>
        <p v-if="transferMessage" class="mb-3 rounded-lg border border-line bg-ink/[0.04] px-3 py-2 text-[12px] text-muted">
          {{ transferMessage }}
        </p>

        <SettingRow :label="t('settings.clearGames')" :hint="t('settings.clearGamesHint')">
          <button class="btn" @click="confirmKind = 'games'">
            <Icon name="games" :size="14" />
            {{ t('common.clear') }}
          </button>
        </SettingRow>

        <SettingRow :label="t('settings.clearQueue')" :hint="t('settings.clearQueueHint')">
          <button class="btn" @click="confirmKind = 'queue'">
            <Icon name="queue" :size="14" />
            {{ t('common.clear') }}
          </button>
        </SettingRow>

        <SettingRow :label="t('settings.clearCache')" :hint="t('settings.clearCacheHint')">
          <button class="btn btn-danger" @click="confirmKind = 'cache'">
            <Icon name="refresh" :size="14" />
            {{ t('common.clear') }}
          </button>
        </SettingRow>

        <div class="mt-4 border-t border-line pt-4">
          <SettingRow :label="t('settings.resetAll')" :hint="t('settings.resetAllHint')">
            <button class="btn btn-danger" @click="resetEverything">
              <Icon name="refresh" :size="14" />
              {{ t('common.reset') }}
            </button>
          </SettingRow>
        </div>
      </section>

      <!-- DEVELOPER -->
      <section v-else-if="section === 'developer'" key="developer" class="panel p-5">
        <h2 class="mb-1 text-[15px] font-semibold text-ink">{{ t('settings.developer') }}</h2>
        <p class="mb-4 max-w-2xl text-[12.5px] leading-relaxed text-muted">
          {{ t('settings.developerHint') }}
        </p>

        <div class="flex max-w-xl flex-col gap-2">
          <a
            class="group flex items-center gap-3 rounded-xl border border-line bg-ink/[0.03] px-4 py-3 transition-colors hover:bg-ink/[0.06]"
            href="https://discord.gg/D8qeW9zJ6T"
            target="_blank"
            rel="noreferrer"
          >
            <span class="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon name="discord" :size="19" />
            </span>
            <span class="flex min-w-0 flex-col">
              <span class="text-[13px] font-semibold text-ink">Discord</span>
              <span class="truncate font-mono text-[11.5px] text-faint">discord.gg/D8qeW9zJ6T</span>
            </span>
            <Icon name="external" :size="14" class="ms-auto flex-none text-faint transition-colors group-hover:text-ink" />
          </a>

          <a
            class="group flex items-center gap-3 rounded-xl border border-line bg-ink/[0.03] px-4 py-3 transition-colors hover:bg-ink/[0.06]"
            href="https://github.com/Bxat01"
            target="_blank"
            rel="noreferrer"
          >
            <span class="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon name="github" :size="19" />
            </span>
            <span class="flex min-w-0 flex-col">
              <span class="text-[13px] font-semibold text-ink">GitHub</span>
              <span class="truncate font-mono text-[11.5px] text-faint">github.com/Bxat01</span>
            </span>
            <Icon name="external" :size="14" class="ms-auto flex-none text-faint transition-colors group-hover:text-ink" />
          </a>
        </div>

        <p class="mt-4 max-w-2xl text-[12px] leading-relaxed text-faint">
          {{ t('settings.developerNote') }}
        </p>
      </section>

      <!-- ABOUT -->
      <section v-else key="about" class="panel p-5">
        <div class="flex items-center gap-3">
          <BrandLogo :size="52" />
          <div class="flex flex-col">
            <span class="text-[17px] font-semibold tracking-tight text-ink">Playfy</span>
            <span class="text-[12px] text-faint">
              {{ t('settings.aboutVersion') }} {{ pkg.version }}
            </span>
          </div>
        </div>

        <p class="mt-4 max-w-2xl text-[13px] leading-relaxed text-muted">
          {{ t('settings.aboutDescription') }}
        </p>

        <p class="mt-3 max-w-2xl text-[12.5px] leading-relaxed text-muted">
          {{ t('settings.aboutOpenSource') }}
          <a
            class="text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent"
            href="https://github.com/Bxat01/playfy"
            target="_blank"
            rel="noreferrer"
          >github.com/Bxat01/playfy</a>
        </p>

        <div class="mt-5 max-w-2xl rounded-xl border border-line bg-ink/[0.03] p-4">
          <h3 class="text-[13px] font-semibold text-ink">{{ t('settings.pfyFormatTitle') }}</h3>
          <p class="mt-1 text-[12.5px] leading-relaxed text-muted">
            {{ t('settings.pfyFormatDescription') }}
          </p>
          <a
            class="mt-2 inline-flex items-center gap-1.5 text-[12px] text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent"
            href="https://github.com/Bxat01/Pfy-Language"
            target="_blank"
            rel="noreferrer"
          >
            {{ t('settings.pfyFormatRepository') }}
            <Icon name="external" :size="12" />
          </a>
        </div>

        <p class="mt-2 text-[12px] text-faint">{{ t('settings.aboutCredits') }}</p>
      </section>
      </Transition>
    </div>

    <input
      ref="importInput"
      type="file"
      accept=".pfy,text/plain"
      class="hidden"
      @change="onImportFile"
    />

    <ConfirmDialog
      :open="confirmKind !== null"
      :title="confirmCopy.title"
      :body="confirmCopy.body"
      :confirm-label="confirmCopy.label"
      :icon="confirmCopy.icon"
      danger
      @confirm="runConfirmedAction"
      @cancel="confirmKind = null"
    />
  </div>
</template>
