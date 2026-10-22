# Build the standalone Windows session card with the compiler included in
# supported .NET Framework installations.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$candidates = @(
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$csc = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csc) {
  throw 'csc.exe was not found. The .NET Framework 4.x compiler is required to build the session card.'
}

$sources = @(Get-ChildItem (Join-Path $root 'src-win-cs') -Filter '*.cs' -File | Sort-Object Name | ForEach-Object { $_.FullName })
if ($sources.Count -eq 0) {
  throw 'No C# sources were found in src-win-cs.'
}

$icon = Join-Path $root 'src-tauri\icons\icon.ico'
$output = Join-Path $root 'src-tauri\resources\playfy-session.exe'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $output) | Out-Null

& $csc /nologo /target:winexe /platform:anycpu /optimize+ "/out:$output" "/win32icon:$icon" $sources
if ($LASTEXITCODE -ne 0) {
  throw "csc failed with exit code $LASTEXITCODE"
}

$size = [Math]::Round((Get-Item $output).Length / 1KB)
Write-Host "Built Playfy session card -> $output ($size KB)"
