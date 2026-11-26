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
function ConvertTo-Plain([string]$s) {
  # Bỏ dấu tiếng Việt khi in ra cửa sổ: phông mặc định của cửa sổ lệnh Windows thiếu nhiều chữ có dấu (hiện ô vuông).
  $n = $s.Replace("đ", "d").Replace("Đ", "D").Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object Text.StringBuilder
  foreach ($ch in $n.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) { [void]$sb.Append($ch) }
  }
  $sb.ToString().Normalize([Text.NormalizationForm]::FormC).Replace("–", "-").Replace("—", "-").Replace("…", "...").Replace("·", "|")
}
function Say([string]$msg, [string]$color = "Gray") { Write-Host (ConvertTo-Plain $msg) -ForegroundColor $color }
$branch = "claude/internal-task-management-app-mau8my"

if ((Test-Path .git) -and (Get-Command git -ErrorAction SilentlyContinue)) {
  Say "==> Tải bản mới từ GitHub" Green
  git pull --ff-only origin $branch
  if ($LASTEXITCODE -ne 0) { Say "[LỖI] Không tải được bản mới (xem thông báo phía trên)." Red; Read-Host (ConvertTo-Plain "Nhấn Enter để đóng"); exit 1 }
  Say "`nĐã có bản mới. Nhấp đúp 2-MO-UNG-DUNG.bat — ứng dụng tự cập nhật dữ liệu và đóng gói lại." Cyan
} else {
  Say "Thư mục này được giải nén từ file zip nên không tự tải bản mới được." Yellow
  Say "Cách cập nhật:"
  Say "  1. Tải file zip phiên bản mới."
  Say "  2. Giải nén ĐÈ vào chính thư mục này (chọn 'Replace' / 'Thay thế tất cả')."
  Say "  3. Nhấp đúp 2-MO-UNG-DUNG.bat — ứng dụng tự nhận biết bản mới, cập nhật dữ liệu và đóng gói lại."
  Say "Dữ liệu đã nhập nằm trong Docker, không bị mất khi giải nén đè."
}
Read-Host (ConvertTo-Plain "`nNhấn Enter để đóng")
