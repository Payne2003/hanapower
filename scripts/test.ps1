<#
.SYNOPSIS
  Chạy kiểm thử: unit | db | e2e | all
.DESCRIPTION
  db và e2e cần Supabase cục bộ đang chạy và .env.local hợp lệ. "db" và "e2e" XÓA rồi nạp lại dữ liệu mẫu.
  e2e: lần đầu cần trình duyệt Playwright: npx playwright install chromium
#>
param([ValidateSet("unit", "db", "e2e", "all")][string]$Suite = "all")
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
function Run($cmd) { Write-Host "`n> $cmd" -ForegroundColor Green; Invoke-Expression $cmd; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }

if ($Suite -in @("unit", "all")) { Run "npm run typecheck"; Run "npm run test" }
if ($Suite -in @("db", "all"))   { Run "npm run test:db" }
if ($Suite -in @("e2e", "all"))  {
  Run "npm run build"
  $env:E2E_RESET_DB = "1"
  Run "npm run test:e2e"
}
