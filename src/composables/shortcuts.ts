import { computed, ref } from 'vue';
import { Pages, useGlobalState } from './app-state';
import { useMyGames } from './my-games';
import { useQueue } from './queue';
import { NIGHT_PALETTES, useSettings } from './settings';

const STORAGE_KEY = 'Playfy.shortcuts.v1';

export interface ShortcutAction {
  id: string;
  label: string;
  group: 'navigation' | 'session' | 'data' | 'appearance';
}

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: 'console.toggle', label: 'shortcuts.consoleToggle', group: 'session' },
  { id: 'search.focus', label: 'shortcuts.searchFocus', group: 'navigation' },
  { id: 'nav.home', label: 'shortcuts.navHome', group: 'navigation' },
  { id: 'nav.queue', label: 'shortcuts.navQueue', group: 'navigation' },
  { id: 'nav.settings', label: 'shortcuts.navSettings', group: 'navigation' },
  { id: 'nav.cycle', label: 'shortcuts.navCycle', group: 'navigation' },
  { id: 'games.clear', label: 'shortcuts.gamesClear', group: 'data' },
  { id: 'queue.clear', label: 'shortcuts.queueClear', group: 'data' },
  { id: 'settings.reset', label: 'shortcuts.settingsReset', group: 'data' },
  { id: 'theme.mode', label: 'shortcuts.themeMode', group: 'appearance' },
  { id: 'theme.cycle', label: 'shortcuts.themeCycle', group: 'appearance' },
];

/**
 * Defaults only use `event.code` names (physical keys), so they keep working
 * on Arabic, Russian, AZERTY or any other layout.
 */
export const DEFAULT_BINDINGS: Record<string, string> = {
  'console.toggle': 'Alt+Backquote',
  'search.focus': 'Alt+KeyF',
  'nav.home': 'Alt+Digit1',
  'nav.queue': 'Alt+Digit2',
  'nav.settings': 'Alt+Digit3',
  'nav.cycle': 'Alt+KeyN',
  'games.clear': 'Alt+Shift+KeyG',
  'queue.clear': 'Alt+Shift+KeyQ',
  'settings.reset': 'Alt+Shift+KeyR',
  'theme.mode': 'Alt+Shift+KeyD',
  'theme.cycle': 'Alt+Shift+KeyP',
};

const KEY_LABELS: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

export function formatCombo(combo: string): string {
  if (!combo) return '';
  return combo
    .split('+')
    .map((part) => {
      if (part.startsWith('Key')) return part.slice(3);
      if (part.startsWith('Digit')) return part.slice(5);
      if (part.startsWith('Numpad')) return `Num ${part.slice(6)}`;
      return KEY_LABELS[part] ?? part;
    })
    .join(' + ');
}

/** Turns a live keyboard event into the stored `Ctrl+Alt+Code` shape. */
export function comboFromEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(event.code || event.key);
  return parts.join('+');
}

function loadBindings(): Record<string, string> {
  const merged = { ...DEFAULT_BINDINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return merged;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    for (const action of SHORTCUT_ACTIONS) {
      const combo = stored[action.id];
      if (typeof combo === 'string' && combo.length > 0) merged[action.id] = combo;
    }
  } catch {
    /* corrupted storage — fall back to the defaults */
  }
  return merged;
}

const bindings = ref<Record<string, string>>(loadBindings());
const capturing = ref(false);
const installed = ref(false);

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings.value));
  } catch {
    /* storage unavailable */
  }
}

/** Runs the action for a normalized combo. Returns true when it matched. */
function runAction(combo: string): boolean {
  const entry = Object.entries(bindings.value).find(([, value]) => value === combo);
  if (!entry) return false;

  const { setPage, page, addLog } = useGlobalState();
  const { settings, reset } = useSettings();
  const myGames = useMyGames();
  const queue = useQueue();

  switch (entry[0]) {
    case 'console.toggle':
      settings.showConsole = !settings.showConsole;
      return true;
    case 'search.focus':
      setPage(Pages.HOME);
      window.setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('[data-search-input]');
        input?.focus();
        input?.select();
      }, 90);
      return true;
    case 'nav.home':
      setPage(Pages.HOME);
      return true;
    case 'nav.queue':
      setPage(Pages.QUEUE);
      return true;
    case 'nav.settings':
      setPage(Pages.SETTINGS);
      return true;
    case 'nav.cycle': {
      const order = [Pages.HOME, Pages.QUEUE, Pages.SETTINGS] as Pages[];
      const at = order.indexOf(page.value);
      setPage(order[(at + 1) % order.length]);
      return true;
    }
    case 'games.clear': {
      const count = myGames.games.value.length;
      myGames.clear();
      addLog('info', `shortcut cleared ${count} game${count === 1 ? '' : 's'} from the library`);
      return true;
    }
    case 'queue.clear': {
      const count = queue.entries.length;
      queue.clearQueue();
      addLog('info', `shortcut cleared ${count} queued game${count === 1 ? '' : 's'}`);
      return true;
    }
    case 'settings.reset':
      setPage(Pages.SETTINGS);
      window.dispatchEvent(new CustomEvent('playfy:reset-settings'));
      return true;
    case 'theme.mode':
      settings.mode = settings.mode === 'day' ? 'night' : 'day';
      return true;
    case 'theme.cycle': {
      const palettes = Object.keys(NIGHT_PALETTES);
      const current = palettes.indexOf(settings.night);
      settings.mode = 'night';
      settings.night = palettes[(current + 1) % palettes.length] as typeof settings.night;
      return true;
    }
    default:
      return false;
  }
}

function onKeyDown(event: KeyboardEvent) {
  if (capturing.value) return;
  const target = event.target as HTMLElement | null;
  const typing =
    !!target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable);
  // Plain letters belong to whatever the user is typing; our combos all carry
  // a modifier, so only skip the bare-key case.
  if (typing && !event.ctrlKey && !event.metaKey && !event.altKey) return;

  const combo = comboFromEvent(event);
  if (!runAction(combo)) return;

  event.preventDefault();
  event.stopPropagation();
}

export function useShortcuts() {
  function install() {
    if (installed.value || typeof window === 'undefined') return;
    window.addEventListener('keydown', onKeyDown, true);
    installed.value = true;
  }

  function uninstall() {
    if (!installed.value) return;
    window.removeEventListener('keydown', onKeyDown, true);
    installed.value = false;
  }

  function setBinding(action: string, combo: string) {
    // A combo can only drive one action — steal it from whoever had it.
    for (const [id, value] of Object.entries(bindings.value)) {
      if (value === combo && id !== action) delete bindings.value[id];
    }
    bindings.value = { ...bindings.value, [action]: combo };
    persist();
  }

  function clearBinding(action: string) {
    const next = { ...bindings.value };
    delete next[action];
    bindings.value = next;
    persist();
  }

  function resetBindings() {
    bindings.value = { ...DEFAULT_BINDINGS };
    persist();
  }

  const list = computed(() =>
    SHORTCUT_ACTIONS.map((action) => ({
      ...action,
      combo: bindings.value[action.id] ?? '',
      display: formatCombo(bindings.value[action.id] ?? ''),
    })),
  );

  return {
    bindings,
    list,
    capturing,
    install,
    uninstall,
    setBinding,
    clearBinding,
    resetBindings,
  };
}
