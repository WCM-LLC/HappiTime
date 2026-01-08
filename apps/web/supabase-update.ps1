$ErrorActionPreference = 'Stop'

$arch = $env:PROCESSOR_ARCHITECTURE
$asset = 'supabase_windows_amd64.tar.gz'
if ($arch -match 'ARM64') {
  $asset = 'supabase_windows_arm64.tar.gz'
}

$dest = Join-Path $PSScriptRoot '.tools\supabase'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$archive = Join-Path $dest $asset
Invoke-WebRequest -Uri "https://github.com/supabase/cli/releases/latest/download/$asset" -OutFile $archive
tar -xzf $archive -C $dest
Remove-Item -Force $archive

$cli = Join-Path $dest 'supabase.exe'
if (!(Test-Path -LiteralPath $cli)) {
  Write-Error "Supabase CLI not found after extraction."
  exit 1
}

& $cli --version
