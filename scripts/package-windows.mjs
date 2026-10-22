import { copyFile, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const version = packageInfo.version;
const outputDir = path.join(root, 'release', 'windows', version);
const portableDir = path.join(outputDir, `Playfy-${version}-Portable`);
const appExecutable = path.join(root, 'src-tauri', 'target', 'release', 'playfy.exe');
const installerDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');

// Keep the first native release build reliable on low-memory PCs.
process.env.CARGO_BUILD_JOBS ??= '1';
process.env.CARGO_PROFILE_RELEASE_OPT_LEVEL ??= '1';

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`);
}

await mkdir(outputDir, { recursive: true });
run(process.execPath, [
  path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
  'build',
  '--bundles',
  'nsis',
]);

const installers = (await readdir(installerDir))
  .filter((name) => name.toLowerCase().endsWith('-setup.exe'));
if (installers.length !== 1) {
  throw new Error(`Expected one NSIS setup executable in ${installerDir}, found ${installers.length}`);
}

await copyFile(
  path.join(installerDir, installers[0]),
  path.join(outputDir, `Playfy-${version}-Setup.exe`),
);
await copyFile(appExecutable, path.join(outputDir, `Playfy-${version}-AppData.exe`));

await mkdir(portableDir, { recursive: true });
await copyFile(appExecutable, path.join(portableDir, `Playfy-${version}.exe`));
await copyFile(path.join(root, 'LICENSE'), path.join(portableDir, 'LICENSE.txt'));
await writeFile(path.join(portableDir, '.playfy-portable'), '');
await writeFile(
  path.join(portableDir, 'README.txt'),
  [
    `Playfy ${version} Portable`,
    '',
    'Run the Playfy executable from this folder. Your library, settings, backups, and session files are stored in the app-data folder beside it.',
    'Keep the executable and the .playfy-portable marker together. Extract the ZIP to a folder where you have permission to write files.',
    'This portable build uses the Microsoft Edge WebView2 Runtime installed on Windows.',
    '',
    'Playfy is open source under the MIT License. See https://github.com/Bxat01/playfy.',
  ].join('\n'),
);

const zipPath = path.join(outputDir, `Playfy-${version}-Portable.zip`);
run('powershell.exe', [
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  path.join(root, 'scripts', 'create-portable-archive.ps1'),
  '-SourceDirectory',
  portableDir,
  '-DestinationPath',
  zipPath,
]);

console.log(`Created Windows distributions in ${path.relative(root, outputDir)}:`);
console.log(`  Playfy-${version}-Setup.exe`);
console.log(`  Playfy-${version}-Portable.zip`);
console.log(`  Playfy-${version}-AppData.exe`);
