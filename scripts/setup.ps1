<#
.SYNOPSIS
  Cài đặt TỰ ĐỘNG ứng dụng HANA MEDIA trên Windows 10/11:
  Node.js 22 LTS, WSL, Docker Desktop (nếu chưa có) → thư viện → Supabase cục bộ
  → cấu hình → cơ sở dữ liệu + dữ liệu mẫu → đóng gói → biểu tượng trên màn hình.
.DESCRIPTION
  Chạy lại an toàn: bước nào đã xong thì bỏ qua; KHÔNG xóa dữ liệu đã nhập
  (trừ khi thêm -ResetData). Nếu Windows cần khởi động lại (WSL/Docker),
  script tự đăng ký chạy tiếp sau khi đăng nhập lại.
    powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
#>
param(
  [switch]$ResetData,
  [switch]$Resume,
  [switch]$Elevated
)
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root
$SupabaseCli = "supabase@2.122.1"
$DockerExe = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
$Marker = Join-Path $Root ".hana-installed"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Green }
function Info($msg) { Write-Host "    $msg" -ForegroundColor Gray }
function Fail($msg) {
  Write-Host "`n[LỖI] $msg" -ForegroundColor Red
  Write-Host "Chụp màn hình cửa sổ này gửi bộ phận kỹ thuật nếu cần hỗ trợ." -ForegroundColor Yellow
  Read-Host "Nhấn Enter để đóng"
  exit 1
}
function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Update-PathFromRegistry {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Register-Resume {
  $cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Resume"
  New-Item -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce" -Force | Out-Null
  Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce" -Name "HanaMediaSetup" -Value $cmd
}
function Request-Reboot($why) {
  Register-Resume
  Write-Host "`n$why" -ForegroundColor Yellow
  Write-Host "Sau khi khởi động lại và đăng nhập, phần cài đặt sẽ TỰ CHẠY TIẾP." -ForegroundColor Yellow
  $a = Read-Host "Khởi động lại máy ngay bây giờ? (C/k)"
  if ($a -eq "" -or $a -match "^[cCyY]") { Restart-Computer -Force }
  exit 0
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  CÀI ĐẶT HANA MEDIA – QUẢN LÝ SẢN XUẤT VIDEO" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
if ($Resume) { Info "Tiếp tục cài đặt sau khi khởi động lại…" }

# ---------------------------------------------------------------- 1. Phần mềm nền
Update-PathFromRegistry
$needNode = -not (Has node)
$needDocker = (-not (Has docker)) -and (-not (Test-Path $DockerExe))
$needWsl = $false
try { wsl.exe --status *> $null; if ($LASTEXITCODE -ne 0) { $needWsl = $true } } catch { $needWsl = $true }

if ($needNode -or $needDocker -or $needWsl) {
  if (-not (Test-Admin)) {
    Step "Cần quyền quản trị để cài phần mềm nền — hãy chọn 'Yes' ở hộp thoại Windows"
    $elevArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"", "-Elevated")
    if ($ResetData) { $elevArgs += "-ResetData" }
    if ($Resume) { $elevArgs += "-Resume" }
    try {
      $p = Start-Process powershell.exe -Verb RunAs -ArgumentList $elevArgs -Wait -PassThru
    } catch { Fail "Không có quyền quản trị. Chạy lại và chọn 'Yes' khi Windows hỏi." }
    exit $p.ExitCode
  }
  if (-not (Has winget)) {
    Fail "Máy chưa có 'App Installer' (winget). Cài từ Microsoft Store (tìm 'App Installer') rồi chạy lại."
  }
  $wg = @("--accept-package-agreements", "--accept-source-agreements", "--silent", "-e")

  if ($needNode) {
    Step "Cài Node.js 22 LTS"
    winget install --id OpenJS.NodeJS.LTS @wg
    Update-PathFromRegistry
    if (-not (Has node)) { Fail "Cài Node.js chưa thành công." }
  }
  if ($needDocker) {
    Step "Cài Docker Desktop (có thể mất vài phút)"
    winget install --id Docker.DockerDesktop @wg --override "install --quiet --accept-license"
    if (-not (Test-Path $DockerExe)) { Fail "Cài Docker Desktop chưa thành công." }
  }
  if ($needWsl) {
    Step "Bật WSL (nền tảng cho Docker Desktop)"
    wsl.exe --install --no-distribution
  }
  if ($needDocker -or $needWsl) {
    # WSL và nhóm docker-users chỉ có hiệu lực sau khi khởi động lại / đăng nhập lại.
    Request-Reboot "Đã cài phần mềm nền. Windows cần khởi động lại để hoàn tất."
  }
}

Update-PathFromRegistry
if (-not (Has node)) { Fail "Không tìm thấy Node.js." }
Info "Node.js $(node --version)"

# ---------------------------------------------------------------- 2. Docker chạy
Step "Khởi động Docker Desktop"
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  if (Test-Path $DockerExe) { Start-Process $DockerExe }
  $deadline = (Get-Date).AddMinutes(6)
  do {
    Start-Sleep -Seconds 5
    Write-Host "." -NoNewline
    Update-PathFromRegistry
    docker info *> $null
  } while ($LASTEXITCODE -ne 0 -and (Get-Date) -lt $deadline)
  Write-Host ""
  if ($LASTEXITCODE -ne 0) {
    Fail "Docker Desktop chưa sẵn sàng. Mở Docker Desktop, chấp nhận điều khoản nếu được hỏi, đợi 'Engine running' rồi chạy lại."
  }
}
Info "Docker đang chạy"

# ---------------------------------------------------------------- 3. Thư viện
Step "Cài thư viện của ứng dụng (lần đầu vài phút)"
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Fail "Cài thư viện lỗi (cần Internet)." }
Set-Content -Path (Join-Path $Root "node_modules\.hana-deps") -Value (node scripts/fingerprint.mjs --deps) -NoNewline

# ---------------------------------------------------------------- 4. Supabase cục bộ
Step "Khởi động máy chủ dữ liệu (lần đầu tải khoảng 1–2 GB, 5–15 phút)"
npx --yes $SupabaseCli start
if ($LASTEXITCODE -ne 0) { Fail "Không khởi động được máy chủ dữ liệu (xem thông báo phía trên)." }

Step "Tạo cấu hình"
$status = npx --yes $SupabaseCli status -o env | Out-String
$vars = @{}
foreach ($line in $status -split "`r?`n") {
  if ($line -match '^\s*([A-Z_]+)="?([^"]*)"?\s*$') { $vars[$Matches[1]] = $Matches[2] }
}
if (-not $vars["API_URL"]) { Fail "Không đọc được thông tin máy chủ dữ liệu." }
$anon = if ($vars["ANON_KEY"]) { $vars["ANON_KEY"] } else { $vars["PUBLISHABLE_KEY"] }
$service = if ($vars["SERVICE_ROLE_KEY"]) { $vars["SERVICE_ROLE_KEY"] } else { $vars["SECRET_KEY"] }
$envContent = @"
SUPABASE_PUBLIC_URL=$($vars["API_URL"])
SUPABASE_ANON_KEY=$anon
SUPABASE_SERVICE_ROLE_KEY=$service
DATABASE_URL=$($vars["DB_URL"])
APP_ENV=development
"@
[IO.File]::WriteAllText((Join-Path $Root ".env.local"), $envContent)

# ---------------------------------------------------------------- 5. Cơ sở dữ liệu
if ($ResetData -or -not (Test-Path $Marker)) {
  Step "Tạo cơ sở dữ liệu và nạp dữ liệu mẫu"
  node scripts/migrate.mjs --reset --yes --seed
} else {
  Step "Cập nhật cơ sở dữ liệu (giữ nguyên dữ liệu đã nhập)"
  node scripts/migrate.mjs
}
if ($LASTEXITCODE -ne 0) { Fail "Lỗi cơ sở dữ liệu (xem thông báo phía trên)." }

# ---------------------------------------------------------------- 6. Đóng gói
Step "Đóng gói ứng dụng (1–2 phút)"
npm run build
if ($LASTEXITCODE -ne 0) { Fail "Đóng gói lỗi (xem thông báo phía trên)." }
Set-Content -Path (Join-Path $Root ".next\.hana-source") -Value (node scripts/fingerprint.mjs) -NoNewline

# ---------------------------------------------------------------- 7. Biểu tượng
Step "Tạo biểu tượng HANA MEDIA trên màn hình và menu Start"
$shell = New-Object -ComObject WScript.Shell
$links = @(
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "HANA MEDIA.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Programs")) "HANA MEDIA.lnk")
)
foreach ($l in $links) {
  $s = $shell.CreateShortcut($l)
  $s.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $s.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$Root\scripts\start.ps1`""
  $s.WorkingDirectory = $Root
  $s.IconLocation = "$Root\public\icons\app.ico"
  $s.Description = "HANA MEDIA – Quản lý sản xuất video"
  $s.Save()
}

Set-Content -Path $Marker -Value (Get-Date -Format s)
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce" -Name "HanaMediaSetup" -ErrorAction SilentlyContinue

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "  CÀI ĐẶT XONG" -ForegroundColor Cyan
Write-Host "  Từ nay nhấp đúp biểu tượng 'HANA MEDIA' trên màn hình để mở." -ForegroundColor Cyan
Write-Host "  Tài khoản thử: leader@hanamedia.local / hieu@hanamedia.local / duy@hanamedia.local" -ForegroundColor Cyan
Write-Host "  Mật khẩu: MatKhau@123" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
$a = Read-Host "Mở ứng dụng ngay? (C/k)"
if ($a -eq "" -or $a -match "^[cCyY]") {
  Start-Process powershell.exe -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$Root\scripts\start.ps1`"") -WorkingDirectory $Root
}
