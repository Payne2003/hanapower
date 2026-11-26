<#
.SYNOPSIS
  Lấy phiên bản mới của ứng dụng. Dữ liệu đã nhập được giữ nguyên.
#>
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
$branch = "claude/internal-task-management-app-mau8my"

if ((Test-Path .git) -and (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "==> Tải bản mới từ GitHub" -ForegroundColor Green
  git pull --ff-only origin $branch
  if ($LASTEXITCODE -ne 0) { Write-Host "[LỖI] Không tải được bản mới (xem thông báo phía trên)." -ForegroundColor Red; Read-Host "Nhấn Enter để đóng"; exit 1 }
  Write-Host "`nĐã có bản mới. Nhấp đúp 2-MO-UNG-DUNG.bat — ứng dụng tự cập nhật dữ liệu và đóng gói lại." -ForegroundColor Cyan
} else {
  Write-Host "Thư mục này được giải nén từ file zip nên không tự tải bản mới được." -ForegroundColor Yellow
  Write-Host "Cách cập nhật:"
  Write-Host "  1. Tải file zip phiên bản mới."
  Write-Host "  2. Giải nén ĐÈ vào chính thư mục này (chọn 'Replace' / 'Thay thế tất cả')."
  Write-Host "  3. Nhấp đúp 2-MO-UNG-DUNG.bat — ứng dụng tự nhận biết bản mới, cập nhật dữ liệu và đóng gói lại."
  Write-Host "Dữ liệu đã nhập nằm trong Docker, không bị mất khi giải nén đè."
}
Read-Host "`nNhấn Enter để đóng"
