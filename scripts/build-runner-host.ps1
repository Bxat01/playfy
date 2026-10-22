# Builds the tiny native Win32 game host. This is the process Discord detects:
# it is copied into a game folder under the exact executable name and stays
# alive next to the separate Playfy session card.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifest = Join-Path $root 'src-win\Cargo.toml'
$output = Join-Path $root 'src-win\target\release\game-host.exe'
$resource = Join-Path $root 'src-tauri\resources\game-host.exe'

Push-Location $root
try {
  cargo build --release --manifest-path $manifest
  if ($LASTEXITCODE -ne 0) {
    throw "cargo build failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

if (-not (Test-Path $output)) {
  throw "The game host binary was not produced at $output"
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resource) | Out-Null
Copy-Item $output $resource -Force

$size = [Math]::Round((Get-Item $resource).Length / 1KB)
Write-Host "Built native game host -> $resource ($size KB)"
