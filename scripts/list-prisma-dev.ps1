$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$env:LOCALAPPDATA = "E:\Projects\.localappdata"

Push-Location $repoRoot
try {
  npx.cmd prisma dev ls
}
finally {
  Pop-Location
}
