import { spawn, spawnSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const action = process.argv[2] ?? 'build';
const platform = process.argv[3] ?? process.env.TAURI_ENV_PLATFORM ?? hostPlatform();
const target = process.env.TAURI_ENV_TARGET_TRIPLE;
const release = ['build', 'runner'].includes(action);

function hostPlatform() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`);
}

function cargoRunner(project) {
  const args = ['build', ...(release ? ['--release'] : []), '--manifest-path', `${project}/Cargo.toml`];
  if (target) args.push('--target', target);
  run('cargo', args);

  const targetDir = target ? `target/${target}` : 'target';
  const suffix = platform === 'windows' ? '.exe' : '';
  const source = path.join(root, project, targetDir, release ? 'release' : 'debug', `${project}${suffix}`);
  return source;
}

async function copyRunner(source, name) {
  const destination = path.join(root, 'src-tauri', 'resources', name);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  console.log(`Prepared ${path.relative(root, destination)}`);
}

async function buildRunner() {
  if (platform === 'windows') {
    run('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      'scripts/build-runner-cs.ps1',
    ]);
    return;
  }

  if (platform === 'linux') {
    await copyRunner(cargoRunner('src-linux'), 'src-linux');
    return;
  }

  if (platform === 'macos') {
    await copyRunner(cargoRunner('src-darwin'), 'src-darwin');
    return;
  }

  throw new Error(`Unsupported target platform: ${platform}`);
}

async function main() {
  if (!['dev', 'build', 'runner'].includes(action)) {
    throw new Error('Usage: node scripts/build-platform.mjs <dev|build|runner> [windows|linux|macos]');
  }

  await buildRunner();
  if (action === 'runner') return;

  if (action === 'build') {
    run(process.execPath, ['node_modules/vue-tsc/bin/vue-tsc.js', '--noEmit']);
    run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
    return;
  }

  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
    cwd: root,
    stdio: 'inherit',
  });

  const stopServer = () => server.kill('SIGTERM');
  process.once('SIGINT', stopServer);
  process.once('SIGTERM', stopServer);
  server.once('error', (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  server.once('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
