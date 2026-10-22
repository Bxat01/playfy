import { path } from '@tauri-apps/api';
import type { GameExecutable } from '@/types/types';

/** Split a raw Discord executable name into readable breadcrumb segments. */
export function splitExecutableName(executable: GameExecutable): string[] {
  const allSections = executable.name.split(/\\|\//);
  const last = allSections.pop();
  const name = last?.split('.').slice(0, -1).join('.') || last;
  return [...allSections, name ?? ''];
}

/**
 * Raw Discord entries only carry `name`. The session runner needs a directory,
 * a filename and a segment count, so fill those in on the row object. Keeping
 * the values on the original object is important: the Play button reads the
 * `is_running`/`is_installed` flags from this same object.
 */
export function decorateExecutable(executable: GameExecutable): GameExecutable {
  if (!executable.filename || executable.path === undefined) {
    const allSections = executable.name.split(/\\|\//);
    executable.filename = allSections.pop() ?? executable.name;
    executable.path = allSections.join(path.sep());
    executable.segments = splitExecutableName(executable).length;
  }
  return executable;
}
