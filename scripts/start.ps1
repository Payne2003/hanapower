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

if (-not (Test-Path .next\BUILD_ID)) {
  Write-Host "==> Đóng gói ứng dụng (chỉ lần đầu, khoảng 1-2 phút)" -ForegroundColor Green
  npm run build
  if ($LASTEXITCODE -ne 0) { Fail "Build lỗi (xem thông báo phía trên)." }
}

Write-Host "==> Mở http://localhost:3000 — giữ cửa sổ này mở trong lúc dùng ứng dụng" -ForegroundColor Cyan
Write-Host "    Tài khoản thử: leader@hanamedia.local / hieu@hanamedia.local / duy@hanamedia.local — mật khẩu MatKhau@123" -ForegroundColor Cyan
Start-Job { Start-Sleep -Seconds 4; Start-Process "http://localhost:3000" } | Out-Null
npm run start
