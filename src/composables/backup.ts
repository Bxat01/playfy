import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import pkg from '../../package.json';
import type { Game, GameExecutable } from '@/types/types';
import { isTauri } from './rpc';
import { DEFAULT_BINDINGS, SHORTCUT_ACTIONS } from './shortcuts';
import { DEFAULT_SETTINGS, normalizeSettings, type AppSettings } from './settings';

/**
 * Playfy's own backup language.
 *
 * `.pfy` is a small, human-readable data language: a versioned header followed
 * by typed values. Settings, shortcuts, the library and the queue are exported
 * as ordinary Pfy values, so the same file can be inspected with the reference
 * parser in the Pfy-Language project. Importing never executes anything: it
 * validates and bounds every field before writing it to localStorage.
 */

type PfyValue = string | number | boolean | null | PfyValue[] | PfyObject;
interface PfyObject {
  [key: string]: PfyValue;
}

export interface BackupPayload {
  settings: AppSettings;
  shortcuts: Record<string, string>;
  games: Game[];
  queue: { entries: { uid: string; game: Game }[]; intervalSec: number; loop: boolean };
}

export interface ParsedBackup {
  text: string;
  payload: BackupPayload;
  fileName: string;
}

const SETTINGS_KEY = 'Playfy.settings.v2';
const GAMES_KEY = 'Playfy.games.v1';
const QUEUE_KEY = 'Playfy.queue.v1';
const SHORTCUTS_KEY = 'Playfy.shortcuts.v1';
const MAX_BACKUP_BYTES = 4 * 1024 * 1024;
const MAX_GAMES = 500;
const MAX_QUEUE = 500;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/* ------------------------------------------------------------------ emitter */

function escapeString(value: string): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function emitObject(value: PfyObject, depth: number): string {
  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  const pad = '  '.repeat(depth + 1);
  const close = '  '.repeat(depth);
  return (
    '{\n' +
    entries
      .map(([key, item]) => `${pad}${IDENTIFIER.test(key) ? key : escapeString(key)}: ${emitValue(item, depth + 1)},`)
      .join('\n') +
    `\n${close}}`
  );
}

function emitArray(value: PfyValue[], depth: number): string {
  if (value.length === 0) return '[]';
  const pad = '  '.repeat(depth + 1);
  const close = '  '.repeat(depth);
  return `[\n${value.map((item) => `${pad}${emitValue(item, depth + 1)},`).join('\n')}\n${close}]`;
}

function emitValue(value: PfyValue, depth = 0): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return escapeString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return emitArray(value, depth);
  return emitObject(value, depth);
}

function emitDocument(values: Record<string, PfyValue>): string {
  const lines = ['pfy 1.0;', ''];
  for (const [key, value] of Object.entries(values)) {
    lines.push(`${IDENTIFIER.test(key) ? key : escapeString(key)} = ${emitValue(value)};`, '');
  }
  return lines.join('\n').trimEnd() + '\n';
}

/* -------------------------------------------------------------------- lexer */

type TokenKind = 'ident' | 'string' | 'number' | 'punct';
interface Token {
  kind: TokenKind;
  value: string;
  offset: number;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '#') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if ('{}[]:=,;@'.includes(ch)) {
      tokens.push({ kind: 'punct', value: ch, offset: i });
      i += 1;
      continue;
    }
    if (ch === '"') {
      const start = i;
      i += 1;
      let escaped = false;
      while (i < source.length) {
        const next = source[i];
        if (!escaped && next === '"') {
          i += 1;
          break;
        }
        if (!escaped && next === '\\') escaped = true;
        else escaped = false;
        i += 1;
      }
      if (source[i - 1] !== '"' || i - start < 2) {
        throw new Error(`Unterminated string at offset ${start}`);
      }
      const raw = source.slice(start, i);
      try {
        tokens.push({ kind: 'string', value: JSON.parse(raw) as string, offset: start });
      } catch {
        throw new Error(`Invalid escape sequence at offset ${start}`);
      }
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(source[i + 1] ?? ''))) {
      const start = i;
      i += 1;
      while (i < source.length && /[0-9.eE+-]/.test(source[i])) i += 1;
      const raw = source.slice(start, i);
      const number = Number(raw);
      if (!Number.isFinite(number)) throw new Error(`Invalid number at offset ${start}`);
      tokens.push({ kind: 'number', value: raw, offset: start });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < source.length && /[A-Za-z0-9_.-]/.test(source[i])) i += 1;
      tokens.push({ kind: 'ident', value: source.slice(start, i), offset: start });
      continue;
    }
    throw new Error(`Unexpected character "${ch}" at offset ${i}`);
  }
  return tokens;
}

/* ------------------------------------------------------------------- parser */

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private next(): Token {
    const token = this.tokens[this.index];
    if (!token) throw new Error('Unexpected end of file');
    this.index += 1;
    return token;
  }

  private accept(value: string): boolean {
    if (this.peek()?.value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private expect(value: string): Token {
    const token = this.next();
    if (token.value !== value) throw new Error(`Expected "${value}" at offset ${token.offset}`);
    return token;
  }

  parse(): Record<string, PfyValue> {
    const header = this.next();
    if (header.kind !== 'ident' || header.value !== 'pfy') throw new Error('Missing Pfy header');
    const version = this.next();
    if (version.kind !== 'number' || Number(version.value) !== 1) {
      throw new Error(`Unsupported Pfy version: ${version.value}`);
    }
    this.accept(';');

    const result: PfyObject = {};
    while (this.peek()) {
      if (this.accept(';') || this.accept(',')) continue;
      const directive = this.accept('@');
      const keyToken = this.next();
      if (keyToken.kind !== 'ident' && keyToken.kind !== 'string') {
        throw new Error(`Expected a key at offset ${keyToken.offset}`);
      }
      const key = directive ? `@${keyToken.value}` : keyToken.value;
      if (FORBIDDEN_KEYS.has(key)) throw new Error(`Forbidden key: ${key}`);
      if (!this.accept('=') && !this.accept(':')) {
        throw new Error(`Expected "=" after "${key}"`);
      }
      result[key] = this.parseValue(0);
      this.accept(';');
      this.accept(',');
    }
    return result;
  }

  private parseValue(depth: number): PfyValue {
    if (depth > 40) throw new Error('Nesting is too deep');
    if (this.accept('{')) {
      const object: PfyObject = {};
      while (!this.accept('}')) {
        if (this.accept(',') || this.accept(';')) continue;
        if (!this.peek()) throw new Error('Unterminated object');
        const keyToken = this.next();
        if (keyToken.kind !== 'ident' && keyToken.kind !== 'string') {
          throw new Error(`Expected an object key at offset ${keyToken.offset}`);
        }
        if (FORBIDDEN_KEYS.has(keyToken.value)) throw new Error(`Forbidden key: ${keyToken.value}`);
        if (!this.accept(':') && !this.accept('=')) {
          throw new Error(`Expected ":" after "${keyToken.value}"`);
        }
        object[keyToken.value] = this.parseValue(depth + 1);
        this.accept(',');
        this.accept(';');
      }
      return object;
    }
    if (this.accept('[')) {
      const array: PfyValue[] = [];
      while (!this.accept(']')) {
        if (this.accept(',') || this.accept(';')) continue;
        if (!this.peek()) throw new Error('Unterminated array');
        array.push(this.parseValue(depth + 1));
        this.accept(',');
        this.accept(';');
      }
      return array;
    }
    const token = this.next();
    if (token.kind === 'string') return token.value;
    if (token.kind === 'number') return Number(token.value);
    if (token.kind === 'ident') {
      if (token.value === 'true') return true;
      if (token.value === 'false') return false;
      if (token.value === 'null') return null;
      return token.value;
    }
    throw new Error(`Unexpected token "${token.value}" at offset ${token.offset}`);
  }
}

/* ----------------------------------------------------------------- validation */

function isRecord(value: PfyValue | undefined): value is PfyObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function shortText(value: PfyValue | undefined, fallback: string, max = 200): string {
  return typeof value === 'string' && value.trim() ? value.slice(0, max) : fallback;
}

function cleanExecutable(value: PfyValue): GameExecutable | null {
  if (!isRecord(value)) return null;
  if (typeof value.name !== 'string' || !value.name.trim()) return null;
  const result: GameExecutable = {
    name: value.name.slice(0, 260),
    is_launcher: value.is_launcher === true,
    os: shortText(value.os, 'win32', 20),
    is_installed: value.is_installed === true,
    is_running: false,
  };
  if (typeof value.filename === 'string') result.filename = value.filename.slice(0, 260);
  if (typeof value.path === 'string') result.path = value.path.slice(0, 1024);
  if (typeof value.segments === 'number' && Number.isFinite(value.segments)) {
    result.segments = Math.max(0, Math.round(value.segments));
  }
  return result;
}

function cleanGame(value: PfyValue): Game | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || !value.id.trim()) return null;
  if (typeof value.name !== 'string' || !value.name.trim()) return null;
  const executables = Array.isArray(value.executables)
    ? value.executables.map(cleanExecutable).filter((exe): exe is GameExecutable => exe !== null).slice(0, 80)
    : [];
  const game: Game = {
    id: value.id.slice(0, 64),
    name: value.name.slice(0, 260),
    executables,
    is_running: false,
    is_installed: value.is_installed === true,
  };
  if (typeof value.uid === 'string' && value.uid.trim()) game.uid = value.uid.slice(0, 80);
  if (Array.isArray(value.aliases)) {
    game.aliases = value.aliases.filter((alias): alias is string => typeof alias === 'string').slice(0, 30);
  }
  if (Array.isArray(value.themes)) {
    game.themes = value.themes.filter((theme): theme is string => typeof theme === 'string').slice(0, 30);
  }
  if (typeof value.icon_hash === 'string') game.icon_hash = value.icon_hash.slice(0, 128);
  if (typeof value.cover_image_hash === 'string') game.cover_image_hash = value.cover_image_hash.slice(0, 128);
  return game;
}

function cleanGameForExport(game: Game): PfyObject {
  const executable = (game.executables ?? []).map((exe) => {
    const value: PfyObject = {
      name: exe.name,
      os: exe.os,
      is_launcher: exe.is_launcher,
      is_installed: exe.is_installed === true,
    };
    if (exe.filename) value.filename = exe.filename;
    if (exe.path) value.path = exe.path;
    if (typeof exe.segments === 'number') value.segments = exe.segments;
    return value;
  });
  const value: PfyObject = {
    id: game.id,
    name: game.name,
    executables: executable,
    is_installed: game.is_installed === true,
  };
  if (game.uid) value.uid = game.uid;
  if (game.aliases?.length) value.aliases = game.aliases;
  if (game.themes?.length) value.themes = game.themes;
  if (game.icon_hash) value.icon_hash = game.icon_hash;
  if (game.cover_image_hash) value.cover_image_hash = game.cover_image_hash;
  return value;
}

function cleanShortcuts(value: PfyValue | undefined): Record<string, string> {
  const result = { ...DEFAULT_BINDINGS };
  if (!isRecord(value)) return result;
  for (const action of SHORTCUT_ACTIONS) {
    const combo = value[action.id];
    if (typeof combo === 'string' && combo.length > 0 && combo.length <= 80) {
      result[action.id] = combo;
    }
  }
  return result;
}

function cleanQueue(value: PfyValue | undefined): BackupPayload['queue'] {
  const result: BackupPayload['queue'] = { entries: [], intervalSec: 300, loop: true };
  if (!isRecord(value)) return result;
  if (typeof value.intervalSec === 'number' && Number.isFinite(value.intervalSec)) {
    result.intervalSec = Math.min(86400, Math.max(15, Math.round(value.intervalSec)));
  }
  if (typeof value.loop === 'boolean') result.loop = value.loop;
  if (!Array.isArray(value.entries)) return result;
  for (const item of value.entries.slice(0, MAX_QUEUE)) {
    if (!isRecord(item)) continue;
    const game = cleanGame(item.game);
    if (!game) continue;
    result.entries.push({
      uid: shortText(item.uid, `import-${result.entries.length + 1}`, 80),
      game,
    });
  }
  return result;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function collectPayload(): BackupPayload {
  const settings = normalizeSettings(readJson<unknown>(SETTINGS_KEY, DEFAULT_SETTINGS));
  const storedShortcuts = readJson<unknown>(SHORTCUTS_KEY, DEFAULT_BINDINGS);
  const storedGames = readJson<unknown>(GAMES_KEY, []);
  const storedQueue = readJson<unknown>(QUEUE_KEY, null);

  const rawGames = Array.isArray(storedGames) ? storedGames : [];
  const games = rawGames
    .map((game) => cleanGame(game as PfyValue))
    .filter((game): game is Game => game !== null)
    .slice(0, MAX_GAMES);

  return {
    settings,
    shortcuts: cleanShortcuts(storedShortcuts as PfyValue),
    games,
    queue: cleanQueue(storedQueue as PfyValue),
  };
}

function payloadToDocument(payload: BackupPayload): string {
  return emitDocument({
    application: 'Playfy',
    format: 'playfy-backup',
    version: pkg.version,
    exported: new Date().toISOString(),
    settings: payload.settings as unknown as PfyValue,
    shortcuts: payload.shortcuts,
    games: payload.games.map(cleanGameForExport),
    queue: {
      intervalSec: payload.queue.intervalSec,
      loop: payload.queue.loop,
      entries: payload.queue.entries.map((entry) => ({
        uid: entry.uid,
        game: cleanGameForExport(entry.game),
      })),
    },
  });
}

/** Parses and validates a complete .pfy backup. Throws a friendly Error. */
export function parseBackup(text: string, fileName = 'backup.pfy'): ParsedBackup {
  if (text.length > MAX_BACKUP_BYTES) throw new Error('This backup is too large.');
  const document = new Parser(tokenize(text)).parse();
  if (document.application !== 'Playfy' || document.format !== 'playfy-backup') {
    throw new Error('This file is not a Playfy backup.');
  }
  if (!isRecord(document.settings)) throw new Error('The backup has no settings section.');
  const payload: BackupPayload = {
    settings: normalizeSettings(document.settings),
    shortcuts: cleanShortcuts(document.shortcuts),
    games: Array.isArray(document.games)
      ? document.games
          .map(cleanGame)
          .filter((game): game is Game => game !== null)
          .slice(0, MAX_GAMES)
      : [],
    queue: cleanQueue(document.queue),
  };
  return { text, payload, fileName };
}

/** Writes a parsed backup. The caller reloads afterwards. */
export function applyBackup(backup: BackupPayload) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(backup.settings));
  localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(backup.shortcuts));
  localStorage.setItem(GAMES_KEY, JSON.stringify(backup.games));
  localStorage.setItem(QUEUE_KEY, JSON.stringify(backup.queue));
}

export function downloadText(text: string, fileName: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Native Save dialog + Rust write. Falls back to a browser download. */
export async function exportBackup(): Promise<string | null> {
  const text = payloadToDocument(collectPayload());
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `Playfy-${stamp}.pfy`;

  if (isTauri) {
    const path = await save({
      title: 'Export Playfy settings',
      defaultPath: fileName,
      filters: [{ name: 'Playfy backup', extensions: ['pfy'] }],
    });
    if (!path) return null;
    await invoke('write_text_file', { path, contents: text });
    return path;
  }

  downloadText(text, fileName);
  return fileName;
}

export async function readBackupFromPath(path: string): Promise<ParsedBackup> {
  const text = await invoke<string>('read_text_file', { path });
  return parseBackup(text, path.split(/[\\/]/).pop() ?? 'backup.pfy');
}

/** Native Open dialog. Returns null when the user cancels. */
export async function pickBackupFile(): Promise<ParsedBackup | null> {
  if (!isTauri) return null;
  const picked = await open({
    title: 'Import Playfy settings',
    multiple: false,
    directory: false,
    filters: [{ name: 'Playfy backup', extensions: ['pfy'] }],
  });
  if (!picked || typeof picked !== 'string') return null;
  return readBackupFromPath(picked);
}
