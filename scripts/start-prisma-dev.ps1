$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$localAppData = "E:\Projects\.localappdata"

New-Item -ItemType Directory -Force -Path $localAppData | Out-Null
$env:LOCALAPPDATA = $localAppData

Push-Location $repoRoot
try {
  npx.cmd prisma dev --name deliver --detach
  npx.cmd prisma dev ls
}
finally {
  Pop-Location
}
