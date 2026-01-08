$ErrorActionPreference = 'Stop'

$cli = Join-Path $PSScriptRoot '.tools\supabase\supabase.exe'
if (!(Test-Path -LiteralPath $cli)) {
  Write-Error "Supabase CLI not found at $cli. Run .\.tools\supabase\supabase.exe --version or reinstall."
  exit 1
}

& $cli @Args
exit $LASTEXITCODE
