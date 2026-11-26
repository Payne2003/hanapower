<#
.SYNOPSIS
  Chuẩn bị máy chủ "Tại văn phòng" (Windows Server/Windows 11 + Docker Desktop, hoặc Linux + Docker).
.EXAMPLE
  powershell -File scripts\onprem-init.ps1 -Domain hanapower.lan
#>
param(
  [string]$Domain = "hanapower.lan",
  [string]$HttpsPort = "443",
  [switch]$Force
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$genArgs = @("scripts/gen-onprem-env.mjs", "--domain", $Domain, "--https-port", $HttpsPort)
if ($Force) { $genArgs += "--force" }
node @genArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Push-Location deploy/onprem
docker compose up -d db auth rest realtime storage
Pop-Location

Write-Host "Chờ CSDL và Auth sẵn sàng..."
Start-Sleep -Seconds 20

$pw = (Select-String -Path deploy/onprem/.env -Pattern '^POSTGRES_PASSWORD=(.*)$').Matches[0].Groups[1].Value
$env:DATABASE_URL = "postgres://postgres:$pw@127.0.0.1:54322/postgres"
$env:APP_ENV = "production"
node scripts/migrate.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Push-Location deploy/onprem
docker compose --profile app up -d --build
Pop-Location
Write-Host "Đã khởi động. Mở https://$Domain (cài chứng chỉ gốc nội bộ trước — xem docs/deploy-onprem.md)." -ForegroundColor Cyan
Write-Host "Tạo doanh nghiệp + tài khoản quản trị đầu tiên:" -ForegroundColor Cyan
Write-Host '  node scripts/bootstrap-org.mjs --org "Tên doanh nghiệp" --email admin@congty.vn --name "Họ tên" --password "<mật khẩu mạnh>"'
