<#
.SYNOPSIS
  Thao tác CSDL: migrate | seed | reset | status
.EXAMPLE
  powershell -File scripts\db.ps1 migrate
  powershell -File scripts\db.ps1 reset      # XÓA dữ liệu ứng dụng rồi migration + seed (chỉ phát triển)
#>
param([ValidateSet("migrate", "seed", "reset", "status")][string]$Action = "migrate")
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
switch ($Action) {
  "migrate" { node scripts/migrate.mjs }
  "seed"    { node scripts/migrate.mjs --seed-only }
  "reset"   { node scripts/migrate.mjs --reset --yes --seed }
  "status"  { node scripts/migrate.mjs --status }
}
exit $LASTEXITCODE
