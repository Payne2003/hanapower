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
function Test-Native([scriptblock]$Command) {
  # Chạy lệnh ngoài qua cmd.exe, chỉ lấy mã thoát; không in thông báo lỗi khi đang chờ (vd. Docker đang khởi động).
  $cmdline = $Command.ToString().Trim()
  cmd.exe /c "$cmdline >nul 2>&1"
  return ($LASTEXITCODE -eq 0)
}
function Fail($msg) { Say "`n[LỖI] $msg" Red; Read-Host (ConvertTo-Plain "Nhấn Enter để đóng"); exit 1 }

if (-not (Test-Path .env.local)) { Fail "Chưa cài đặt xong. Chạy lại bộ cài HANA MEDIA (hoặc 1-CAI-DAT.bat)." }
Say "==> Khởi động HANA MEDIA…" Green
if (-not (Test-Native { docker info })) {
  # Tự mở Docker Desktop và đợi sẵn sàng
  $DockerExe = Join-Path $ProgramFiles64 "Docker\Docker\Docker Desktop.exe"
  if (Test-Path $DockerExe) { Start-Process $DockerExe }
  Write-Host "    Dang mo Docker Desktop" -NoNewline
  $deadline = (Get-Date).AddMinutes(5)
  do { Start-Sleep -Seconds 4; Write-Host "." -NoNewline; $ok = Test-Native { docker info } } while (-not $ok -and (Get-Date) -lt $deadline)
  Say ""
  if (-not $ok) { Fail "Docker Desktop chưa chạy được. Mở Docker Desktop thủ công, đợi 'Engine running' rồi thử lại." }
}

Say "==> Bật Supabase cục bộ" Green
npx --yes supabase@2.122.1 start
if ($LASTEXITCODE -ne 0) { Fail "Không khởi động được Supabase cục bộ." }

# Tự nhận biết bản mới: phụ thuộc thay đổi → cài lại; mã nguồn thay đổi → build lại.
$depsNow = node scripts/fingerprint.mjs --deps
$depsOld = if (Test-Path node_modules\.hana-deps) { Get-Content node_modules\.hana-deps -Raw } else { "" }
if (-not (Test-Path node_modules) -or $depsNow -ne "$depsOld".Trim()) {
  Say "==> Có thay đổi thư viện — cài lại phụ thuộc" Green
  npm ci
  if ($LASTEXITCODE -ne 0) { Fail "Cài phụ thuộc lỗi (xem thông báo phía trên)." }
  Set-Content -Path node_modules\.hana-deps -Value $depsNow -NoNewline
}

Say "==> Cập nhật cấu trúc dữ liệu (chỉ áp dụng phần mới, không xóa dữ liệu)" Green
node scripts/migrate.mjs
if ($LASTEXITCODE -ne 0) { Fail "Cập nhật cơ sở dữ liệu lỗi (xem thông báo phía trên)." }

$srcNow = node scripts/fingerprint.mjs
$srcOld = if (Test-Path .next\.hana-source) { Get-Content .next\.hana-source -Raw } else { "" }
if (-not (Test-Path .next\BUILD_ID) -or $srcNow -ne "$srcOld".Trim()) {
  Say "==> Đóng gói phiên bản mới (khoảng 1-2 phút)" Green
  npm run build
  if ($LASTEXITCODE -ne 0) { Fail "Build lỗi (xem thông báo phía trên)." }
  Set-Content -Path .next\.hana-source -Value $srcNow -NoNewline
}


# Cho máy khác trong mạng LAN truy cập (cách 1: một máy chủ, nhân viên mở trình duyệt)
$fwName = "HANA MEDIA (cong 3000)"
if (-not (Get-NetFirewallRule -DisplayName $fwName -ErrorAction SilentlyContinue)) {
  Say "==> Mo cong 3000 tren tuong lua Windows cho mang noi bo (chon 'Yes' neu Windows hoi)" Green
  $cmd = "New-NetFirewallRule -DisplayName '$fwName' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private,Domain | Out-Null"
  try { Start-Process $PS64 -Verb RunAs -Wait -ArgumentList @("-NoProfile", "-Command", $cmd) } catch { Say "    Bo qua: chua mo duoc cong 3000 (nhan vien se khong truy cap duoc)." Yellow }
}
$ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
  $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.InterfaceAlias -notmatch "vEthernet|WSL|Loopback|Docker|VirtualBox|VMware"
} | Select-Object -ExpandProperty IPAddress)
Say "==> Mở http://localhost:3000 — giữ cửa sổ này mở trong lúc dùng ứng dụng" Cyan
foreach ($ip in $ips) { Say "    Nhân viên trong mạng LAN mở trình duyệt vào:  http://$($ip):3000" Yellow }
Say "    (Máy này phải bật và giữ cửa sổ này mở. Mạng Wi-Fi/LAN phải đặt là 'Private' trong Windows.)" Gray
Start-Job { Start-Sleep -Seconds 4; Start-Process "http://localhost:3000" } | Out-Null
npm run start
