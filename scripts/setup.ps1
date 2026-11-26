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

function Fail($msg) {
  Write-Host "`n[LỖI] $msg" -ForegroundColor Red
  Read-Host "Nhấn Enter để đóng"
  exit 1
}

Step "Kiểm tra Node.js"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "Chưa cài Node.js. Cài bản 22 LTS tại https://nodejs.org (hoặc: winget install OpenJS.NodeJS.LTS), rồi chạy lại."
}
$nodeVersion = (node --version)
if (-not $nodeVersion.StartsWith("v22.")) { Write-Warning "Khuyến nghị Node.js 22 LTS (hiện tại: $nodeVersion)" }

if (-not $SkipSupabase) {
  Step "Kiểm tra Docker Desktop"
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail "Chưa cài Docker Desktop. Tải tại https://www.docker.com/products/docker-desktop (hoặc: winget install Docker.DockerDesktop), mở Docker Desktop rồi chạy lại."
  }
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { Fail "Docker Desktop chưa chạy. Mở Docker Desktop, đợi biểu tượng cá voi báo 'running', rồi chạy lại." }
}

if (-not $SkipInstall) {
  Step "Cài phụ thuộc (npm ci — đúng phiên bản trong package-lock.json)"
  npm ci
}

if (-not $SkipSupabase) {
  Step "Khởi động Supabase cục bộ (Docker Desktop phải đang chạy)"
  npx --yes supabase@2.122.1 start
  if ($LASTEXITCODE -ne 0) { Fail "Không khởi động được Supabase cục bộ (xem thông báo phía trên)." }
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

Write-Host "`nCài đặt xong. Từ nay chỉ cần nhấp đúp 2-MO-UNG-DUNG.bat để mở ứng dụng." -ForegroundColor Cyan
Write-Host "Tài khoản mẫu: leader@hanamedia.local / MatKhau@123 (xem README)" -ForegroundColor Cyan
