<#
.SYNOPSIS
  Cài đặt môi trường phát triển trên Windows: phụ thuộc npm, Supabase cục bộ, .env.local, migration và dữ liệu mẫu.
.DESCRIPTION
  Yêu cầu: Node.js 22 LTS, Docker Desktop đang chạy (cho Supabase CLI).
  Chạy từ thư mục gốc repository:
    powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
#>
param(
  [switch]$SkipInstall,
  [switch]$SkipSupabase
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Green }

Step "Kiểm tra Node.js"
$nodeVersion = (node --version)
if (-not $nodeVersion.StartsWith("v22.")) { Write-Warning "Khuyến nghị Node.js 22 LTS (hiện tại: $nodeVersion)" }

if (-not $SkipInstall) {
  Step "Cài phụ thuộc (npm ci — đúng phiên bản trong package-lock.json)"
  npm ci
}

if (-not $SkipSupabase) {
  Step "Khởi động Supabase cục bộ (Docker Desktop phải đang chạy)"
  npx --yes supabase@2.122.1 start
}

Step "Tạo .env.local từ thông tin Supabase cục bộ"
$status = npx --yes supabase@2.122.1 status -o env | Out-String
$vars = @{}
foreach ($line in $status -split "`r?`n") {
  if ($line -match '^\s*([A-Z_]+)="?([^"]*)"?\s*$') { $vars[$Matches[1]] = $Matches[2] }
}
if (-not $vars["API_URL"]) { throw "Không đọc được 'supabase status'. Supabase đã chạy chưa?" }
$envContent = @"
SUPABASE_PUBLIC_URL=$($vars["API_URL"])
SUPABASE_ANON_KEY=$($vars["ANON_KEY"])
SUPABASE_SERVICE_ROLE_KEY=$($vars["SERVICE_ROLE_KEY"])
DATABASE_URL=$($vars["DB_URL"])
APP_ENV=development
"@
if (Test-Path .env.local) {
  Copy-Item .env.local ".env.local.bak" -Force
  Write-Host "Đã sao lưu .env.local cũ thành .env.local.bak"
}
Set-Content -Path .env.local -Value $envContent -Encoding UTF8
Write-Host "Đã ghi .env.local"

Step "Chạy migration và nạp dữ liệu mẫu (XÓA dữ liệu cục bộ cũ)"
node scripts/migrate.mjs --reset --yes --seed

Write-Host "`nXong. Chạy ứng dụng: npm run dev  →  http://localhost:3000" -ForegroundColor Cyan
Write-Host "Tài khoản mẫu: leader@hanamedia.local / MatKhau@123 (xem README)" -ForegroundColor Cyan
