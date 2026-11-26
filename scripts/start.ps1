<#
.SYNOPSIS
  Mở ứng dụng HANA MEDIA trên máy này: bật Supabase cục bộ, build (lần đầu), chạy máy chủ và mở trình duyệt.
#>
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
function Fail($msg) { Write-Host "`n[LỖI] $msg" -ForegroundColor Red; Read-Host "Nhấn Enter để đóng"; exit 1 }

if (-not (Test-Path .env.local)) { Fail "Chưa cài đặt. Nhấp đúp 1-CAI-DAT.bat trước." }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker Desktop chưa chạy. Mở Docker Desktop rồi thử lại." }

Write-Host "==> Bật Supabase cục bộ" -ForegroundColor Green
npx --yes supabase@2.122.1 start
if ($LASTEXITCODE -ne 0) { Fail "Không khởi động được Supabase cục bộ." }

# Tự nhận biết bản mới: phụ thuộc thay đổi → cài lại; mã nguồn thay đổi → build lại.
$depsNow = node scripts/fingerprint.mjs --deps
$depsOld = if (Test-Path node_modules\.hana-deps) { Get-Content node_modules\.hana-deps -Raw } else { "" }
if (-not (Test-Path node_modules) -or $depsNow -ne "$depsOld".Trim()) {
  Write-Host "==> Có thay đổi thư viện — cài lại phụ thuộc" -ForegroundColor Green
  npm ci
  if ($LASTEXITCODE -ne 0) { Fail "Cài phụ thuộc lỗi (xem thông báo phía trên)." }
  Set-Content -Path node_modules\.hana-deps -Value $depsNow -NoNewline
}

Write-Host "==> Cập nhật cấu trúc dữ liệu (chỉ áp dụng phần mới, không xóa dữ liệu)" -ForegroundColor Green
node scripts/migrate.mjs
if ($LASTEXITCODE -ne 0) { Fail "Cập nhật cơ sở dữ liệu lỗi (xem thông báo phía trên)." }

$srcNow = node scripts/fingerprint.mjs
$srcOld = if (Test-Path .next\.hana-source) { Get-Content .next\.hana-source -Raw } else { "" }
if (-not (Test-Path .next\BUILD_ID) -or $srcNow -ne "$srcOld".Trim()) {
  Write-Host "==> Đóng gói phiên bản mới (khoảng 1-2 phút)" -ForegroundColor Green
  npm run build
  if ($LASTEXITCODE -ne 0) { Fail "Build lỗi (xem thông báo phía trên)." }
  Set-Content -Path .next\.hana-source -Value $srcNow -NoNewline
}

Write-Host "==> Mở http://localhost:3000 — giữ cửa sổ này mở trong lúc dùng ứng dụng" -ForegroundColor Cyan
Write-Host "    Tài khoản thử: leader@hanamedia.local / hieu@hanamedia.local / duy@hanamedia.local — mật khẩu MatKhau@123" -ForegroundColor Cyan
Start-Job { Start-Sleep -Seconds 4; Start-Process "http://localhost:3000" } | Out-Null
npm run start
