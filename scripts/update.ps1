<#
.SYNOPSIS
  Lấy phiên bản mới của ứng dụng. Dữ liệu đã nhập được giữ nguyên.
#>
$ErrorActionPreference = "Stop"
# Bộ cài (NSIS) là chương trình 32-bit nên có thể mở PowerShell 32-bit (SysWOW64). Trong chế độ đó Windows
# giấu wsl.exe và trỏ "Program Files" sang thư mục (x86) → chạy lại bằng PowerShell 64-bit.
if ([Environment]::Is64BitOperatingSystem -and -not [Environment]::Is64BitProcess) {
  $ps64 = Join-Path $env:windir "sysnative\WindowsPowerShell\v1.0\powershell.exe"
  $fwd = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"") + @()
  $p = Start-Process $ps64 -ArgumentList $fwd -Wait -PassThru -NoNewWindow
  exit $p.ExitCode
}
$PS64 = Join-Path $env:windir "System32\WindowsPowerShell\v1.0\powershell.exe"
$ProgramFiles64 = if ($env:ProgramW6432) { $env:ProgramW6432 } else { $env:ProgramFiles }

try { [Console]::OutputEncoding = [Text.Encoding]::UTF8; $OutputEncoding = [Text.Encoding]::UTF8; chcp.com 65001 > $null } catch { }
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
