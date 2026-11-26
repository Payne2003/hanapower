<#
.SYNOPSIS
  Mở ứng dụng HANA MEDIA trên máy này: bật Supabase cục bộ, build (lần đầu), chạy máy chủ và mở trình duyệt.
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
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
if (Test-Path "$ProgramFiles64\nodejs\node.exe") { $env:Path = "$ProgramFiles64\nodejs;$env:Path" }
function Test-Native([scriptblock]$Command) {
  # Chạy lệnh ngoài, chỉ quan tâm mã thoát; không để thông báo lỗi (stderr) làm dừng script trên PowerShell 5.1.
  $old = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { & $Command *> $null; return ($LASTEXITCODE -eq 0) } catch { return $false } finally { $ErrorActionPreference = $old }
}
function Fail($msg) { Write-Host "`n[LỖI] $msg" -ForegroundColor Red; Read-Host "Nhấn Enter để đóng"; exit 1 }

if (-not (Test-Path .env.local)) { Fail "Chưa cài đặt xong. Chạy lại bộ cài HANA MEDIA (hoặc 1-CAI-DAT.bat)." }
Write-Host "==> Khởi động HANA MEDIA…" -ForegroundColor Green
if (-not (Test-Native { docker info })) {
  # Tự mở Docker Desktop và đợi sẵn sàng
  $DockerExe = Join-Path $ProgramFiles64 "Docker\Docker\Docker Desktop.exe"
  if (Test-Path $DockerExe) { Start-Process $DockerExe }
  Write-Host "    Đang mở Docker Desktop" -NoNewline
  $deadline = (Get-Date).AddMinutes(5)
  do { Start-Sleep -Seconds 4; Write-Host "." -NoNewline; $ok = Test-Native { docker info } } while (-not $ok -and (Get-Date) -lt $deadline)
  Write-Host ""
  if (-not $ok) { Fail "Docker Desktop chưa chạy được. Mở Docker Desktop thủ công, đợi 'Engine running' rồi thử lại." }
}

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
