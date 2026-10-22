import { createGlobalState } from '@vueuse/core';
import { reactive, watch } from 'vue';
import type { LanguageCode } from './i18n';

export type DayNightMode = 'day' | 'night';
export type NightPalette = 'onyx' | 'dark' | 'ash';
export type SurfaceStyle = 'glass' | 'classic';

export interface BackgroundSettings {
  enabled: boolean;
  /** preset id from the bundled gallery, or 'custom' */
  id: string;
  url: string | null;
  /** 0 – 1, how present the artwork is */
  opacity: number;
  /** 0 – 40px, gaussian blur applied to the artwork */
  blur: number;
  /** 0 – 1, flat darkening on top of the artwork */
  dim: number;
  /** 0 – 1, vignette strength, keeps the UI readable */
  shadow: number;
}

export interface AppSettings {
  mode: DayNightMode;
  night: NightPalette;
  accent: string;
  surface: SurfaceStyle;
  /** 0 – 32px, only used in glass mode */
  glassBlur: number;
  /** 0.25 – 1, panel opacity, only used in glass mode */
  glassOpacity: number;
  font: string;
  background: BackgroundSettings;
  language: LanguageCode;
  /** show the terminal dock at the bottom of the window */
  showConsole: boolean;
  /** default rotation interval for new queues, in seconds */
  defaultInterval: number;
  queueLoop: boolean;
}

export const NIGHT_PALETTES: Record<NightPalette, string> = {
  onyx: '#050506',
  dark: '#121317',
  ash: '#2A2B30',
};

export const ACCENT_PRESETS = [
  '#0062FF', // Playfy blue
  '#4C8DFF',
  '#6FA8DC',
  '#8FB573',
  '#E8B65B',
  '#D97757',
  '#B48EE8',
  '#E56B8C',
  '#F0F2F5',
];

export const FONT_OPTIONS = [
  { id: 'system', label: 'settings.fontSystem', value: '"Segoe UI Variable Text", "Segoe UI", system-ui, "Noto Sans", "Noto Sans Arabic", sans-serif' },
  { id: 'segoe', label: 'settings.fontSegoe', value: '"Segoe UI", sans-serif' },
  { id: 'tahoma', label: 'settings.fontTahoma', value: 'Tahoma, "Segoe UI", sans-serif' },
  { id: 'verdana', label: 'settings.fontVerdana', value: 'Verdana, Geneva, sans-serif' },
  { id: 'georgia', label: 'settings.fontGeorgia', value: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'settings.fontMono', value: '"Cascadia Code", Consolas, "JetBrains Mono", monospace' },
];

const WALLPAPER_VERSIONS: Record<string, string> = {
  orm8g5kdp6ltvv4ncwya: '1792535239',
  o8g0dmhpmhbh7zvoawvo: '1792535239',
  vebrahkp7ljbhlzpzggk: '1792535231',
  ut5n1dvbpyjcpc5ysamz: '1792535238',
  i7uqusbgbiq4vro5idw1: '1792535232',
  avcht4oi7knsaqe9dqd6: '1792535232',
  gaesidhigmk4hjxmhu88: '1792535232',
  wio6fnk0vglowjl30qhc: '1792535231',
  n3yngjidiahccnqsazdi: '1792535196',
  eefhsjh0f5d3rdm1ghxp: '1792535230',
  sgljdqw5hicrv484aygm: '1792535184',
  luydccs7u8xqkteg95me: '1792535184',
  hg4gpvqist0lqb6xqq3e: '1792535183',
  ol0mbhrzo8wt8e7enw09: '1792535183',
  b97nya8sivesjyyc8koy: '1792535178',
  yhrmnsornt4zx5yklu0h: '1792535179',
  z0g7t9p2ym0ldlzchbpd: '1792535177',
  qc4bnxarvuagx2shaeuz: '1792535178',
  ciablmglqrqeecpqclwc: '1792535165',
  fr4bcucnihjiafaprvay: '1792535164',
  yfzmdmrakhe5mhtkhrsy: '1792535165',
  qvjpjnsczsbcxezkyutk: '1792535164',
};

/**
 * Curated wallpapers. Thumbnails are served through Cloudinary's on-the-fly
 * transformations so the settings grid stays light even on slow connections.
 */
export const WALLPAPERS = [
  'orm8g5kdp6ltvv4ncwya.jpg',
  'o8g0dmhpmhbh7zvoawvo.jpg',
  'vebrahkp7ljbhlzpzggk.jpg',
  'ut5n1dvbpyjcpc5ysamz.jpg',
  'i7uqusbgbiq4vro5idw1.jpg',
  'avcht4oi7knsaqe9dqd6.jpg',
  'gaesidhigmk4hjxmhu88.jpg',
  'wio6fnk0vglowjl30qhc.jpg',
  'n3yngjidiahccnqsazdi.jpg',
  'eefhsjh0f5d3rdm1ghxp.jpg',
  'sgljdqw5hicrv484aygm.jpg',
  'luydccs7u8xqkteg95me.jpg',
  'hg4gpvqist0lqb6xqq3e.jpg',
  'ol0mbhrzo8wt8e7enw09.jpg',
  'b97nya8sivesjyyc8koy.png',
  'yhrmnsornt4zx5yklu0h.jpg',
  'z0g7t9p2ym0ldlzchbpd.jpg',
  'qc4bnxarvuagx2shaeuz.jpg',
  'ciablmglqrqeecpqclwc.jpg',
  'fr4bcucnihjiafaprvay.jpg',
  'yfzmdmrakhe5mhtkhrsy.jpg',
  'qvjpjnsczsbcxezkyutk.jpg',
].map((file) => {
  const [publicId, ext] = file.split('.');
  const version = WALLPAPER_VERSIONS[publicId];
  return {
    id: publicId,
    full: `https://res.cloudinary.com/ddqedxovk/image/upload/v${version}/${publicId}.${ext}`,
    thumb: `https://res.cloudinary.com/ddqedxovk/image/upload/w_320,h_180,c_fill,q_auto,f_auto/v${version}/${publicId}.${ext}`,
  };
});

export const DEFAULT_SETTINGS: AppSettings = {
  mode: 'night',
  night: 'dark',
  accent: '#0062FF',
  surface: 'classic',
  glassBlur: 0,
  glassOpacity: 0.96,
  font: FONT_OPTIONS[0].value,
  background: {
    enabled: false,
    id: WALLPAPERS[0].id,
    url: WALLPAPERS[0].full,
    opacity: 0.85,
    blur: 0,
    dim: 0.25,
    shadow: 0.45,
  },
  language: 'en',
  showConsole: true,
  defaultInterval: 300,
  queueLoop: true,
};

// Bumped for the Playfy appearance settings. Game data and queue keys are
// intentionally untouched, so only appearance values live under this key.
const STORAGE_KEY = 'Playfy.settings.v2';

const NIGHT_KEYS: NightPalette[] = ['onyx', 'dark', 'ash'];
const LANGUAGE_KEYS: LanguageCode[] = ['en', 'ru', 'hi', 'zh', 'ar'];

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function cleanText(value: unknown, fallback: string, max = 200): string {
  return typeof value === 'string' && value.trim() ? value.slice(0, max) : fallback;
}

function cleanAccent(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_SETTINGS.accent;
  const raw = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return ('#' + raw.slice(1).split('').map((part) => part + part).join('')).toUpperCase();
  }
  return DEFAULT_SETTINGS.accent;
}

function cleanBackgroundUrl(value: unknown, fallback: string | null): string | null {
  if (typeof value !== 'string') return fallback;
  const url = value.trim();
  if (!url || url.length > 2048) return fallback;
  if (/^https?:\/\//i.test(url) || /^data:image\//i.test(url)) return url;
  return fallback;
}

/**
 * Turns an untrusted settings object (localStorage or an imported .pfy file)
 * into a complete, bounded AppSettings value. Every field is checked so a
 * broken or hand-edited backup can never put the UI into an invalid state.
 */
export function normalizeSettings(input: unknown): AppSettings {
  const result = structuredClone(DEFAULT_SETTINGS);
  if (!input || typeof input !== 'object') return result;
  const source = input as Record<string, unknown>;

  if (source.mode === 'day' || source.mode === 'night') result.mode = source.mode;
  if (NIGHT_KEYS.includes(source.night as NightPalette)) result.night = source.night as NightPalette;
  result.accent = cleanAccent(source.accent);
  if (source.surface === 'glass' || source.surface === 'classic') result.surface = source.surface;
  result.glassBlur = clampNumber(source.glassBlur, result.glassBlur, 0, 32);
  result.glassOpacity = clampNumber(source.glassOpacity, result.glassOpacity, 0.25, 1);
  result.font = cleanText(source.font, result.font, 240);
  result.language = LANGUAGE_KEYS.includes(source.language as LanguageCode)
    ? (source.language as LanguageCode)
    : result.language;
  if (typeof source.showConsole === 'boolean') result.showConsole = source.showConsole;
  result.defaultInterval = Math.round(clampNumber(source.defaultInterval, result.defaultInterval, 15, 86400));
  if (typeof source.queueLoop === 'boolean') result.queueLoop = source.queueLoop;

  const background = source.background;
  if (background && typeof background === 'object') {
    const bg = background as Record<string, unknown>;
    if (typeof bg.enabled === 'boolean') result.background.enabled = bg.enabled;
    result.background.id = cleanText(bg.id, result.background.id, 120);
    result.background.url = cleanBackgroundUrl(bg.url, result.background.url);
    result.background.opacity = clampNumber(bg.opacity, result.background.opacity, 0, 1);
    result.background.blur = clampNumber(bg.blur, result.background.blur, 0, 40);
    result.background.dim = clampNumber(bg.dim, result.background.dim, 0, 0.9);
    result.background.shadow = clampNumber(bg.shadow, result.background.shadow, 0, 1);
  }

  return result;
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const merged = normalizeSettings(JSON.parse(raw));
    // The old teal was the previous default accent. Move it to the new Playfy
    // blue once, while leaving any custom accent the user picked untouched.
    if (String(merged.accent).toLowerCase() === '#38737A') {
      merged.accent = DEFAULT_SETTINGS.accent;
    }
    return merged;
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/** Written before the first paint so the window never flashes the wrong theme. */
export function bootstrapSettings() {
  applySettingsToDom(loadSettings());
}

function readableInk(hex: string): string {
  const raw = hex.replace('#', '').trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((part) => part + part)
          .join('')
      : raw.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? '#09090B' : '#FFFFFF';
}

export function applySettingsToDom(settings: AppSettings) {
  const root = document.documentElement;
  root.dataset.mode = settings.mode;
  root.dataset.night = settings.night;
  root.dataset.surface = settings.surface;

  root.style.setProperty('--c-accent', settings.accent);
  root.style.setProperty('--c-accent-soft', `color-mix(in srgb, ${settings.accent} 22%, transparent)`);
  root.style.setProperty('--c-accent-ink', readableInk(settings.accent));
  root.style.setProperty('--c-font', settings.font);
  root.style.setProperty('--glass-blur', `${settings.glassBlur}px`);
  root.style.setProperty('--glass-alpha', String(settings.glassOpacity));

  const bg = settings.background;
  root.style.setProperty('--wall-url', bg.enabled && bg.url ? `url("${bg.url}")` : 'none');
  root.style.setProperty('--wall-opacity', String(bg.opacity));
  root.style.setProperty('--wall-blur', `${bg.blur}px`);
  root.style.setProperty('--wall-dim', String(bg.dim));
  root.style.setProperty('--wall-shadow', String(bg.shadow));
}

export const useSettings = createGlobalState(() => {
  const settings = reactive<AppSettings>(loadSettings());

  watch(
    settings,
    () => {
      applySettingsToDom(settings);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch {
        /* private mode / quota — settings stay in memory for this session */
      }
    },
    { deep: true },
  );

  function reset() {
    const fresh = structuredClone(DEFAULT_SETTINGS);
    Object.assign(settings, fresh);
  }

  return { settings, reset, wallpapers: WALLPAPERS, accentPresets: ACCENT_PRESETS, fontOptions: FONT_OPTIONS };
});
