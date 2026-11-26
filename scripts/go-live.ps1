<#
.SYNOPSIS
  Chuyển sang DÙNG THẬT: xóa toàn bộ dữ liệu mẫu và tài khoản mẫu, tạo doanh nghiệp + tài khoản quản trị của bạn.
  Sau đó vào mục Nhân sự để tạo tài khoản cho nhân viên.
#>
$ErrorActionPreference = "Stop"
if ([Environment]::Is64BitOperatingSystem -and -not [Environment]::Is64BitProcess) {
  $ps64 = Join-Path $env:windir "sysnative\WindowsPowerShell\v1.0\powershell.exe"
  $p = Start-Process $ps64 -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"") -Wait -PassThru -NoNewWindow
  exit $p.ExitCode
}
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8; chcp.com 65001 > $null } catch { }
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
$ProgramFiles64 = if ($env:ProgramW6432) { $env:ProgramW6432 } else { $env:ProgramFiles }
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
function Fail($msg) { Say "`n[LỖI] $msg" Red; Read-Host (ConvertTo-Plain "Nhấn Enter để đóng"); exit 1 }

if (-not (Test-Path .env.local)) { Fail "Chưa cài đặt xong. Chạy bộ cài HANA MEDIA trước." }

Say "==========================================" Cyan
Say "  BẮT ĐẦU DÙNG THẬT – HANA MEDIA" Cyan
Say "==========================================" Cyan
Say "Thao tác này sẽ XÓA TOÀN BỘ dữ liệu hiện có (video mẫu, tài khoản mẫu, mọi thứ đã nhập thử)" Yellow
Say "và tạo doanh nghiệp + tài khoản quản trị của bạn. Không thể hoàn tác." Yellow
$c = Read-Host (ConvertTo-Plain "Gõ XOA (chữ in hoa) để tiếp tục")
if ($c -ne "XOA") { Say "Đã hủy. Không thay đổi gì." Gray; Read-Host (ConvertTo-Plain "Nhấn Enter để đóng"); exit 0 }

$org = Read-Host (ConvertTo-Plain "Tên doanh nghiệp (vd. HANA MEDIA)")
if (-not $org) { $org = "HANA MEDIA" }
$name = Read-Host (ConvertTo-Plain "Họ tên của bạn")
$email = Read-Host (ConvertTo-Plain "Email đăng nhập của bạn")
do {
  $sec = Read-Host (ConvertTo-Plain "Mật khẩu (tối thiểu 8 ký tự)") -AsSecureString
  $pw = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  if ($pw.Length -lt 8) { Say "Mật khẩu quá ngắn." Yellow }
} while ($pw.Length -lt 8)
if (-not $name -or -not $email) { Fail "Cần nhập họ tên và email." }

Say "`n==> Bật máy chủ dữ liệu" Green
npx --yes supabase@2.122.1 start
if ($LASTEXITCODE -ne 0) { Fail "Không khởi động được máy chủ dữ liệu. Mở Docker Desktop rồi thử lại." }

Say "`n==> Xóa dữ liệu mẫu và tạo cơ sở dữ liệu trống" Green
node scripts/migrate.mjs --reset --yes
if ($LASTEXITCODE -ne 0) { Fail "Lỗi khi tạo cơ sở dữ liệu." }
# Xóa mọi tài khoản đăng nhập còn lại (kể cả tài khoản thử tạo thêm)
node -e "const pg=require('pg');const fs=require('fs');const u=fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();const c=new pg.Client({connectionString:u});c.connect().then(()=>c.query('delete from auth.users')).then(()=>c.end())"
if ($LASTEXITCODE -ne 0) { Fail "Không xóa được tài khoản cũ." }

Say "`n==> Tạo doanh nghiệp và tài khoản quản trị" Green
$env:BOOTSTRAP_PASSWORD = $pw
node scripts/bootstrap-org.mjs --org "$org" --email "$email" --name "$name"
$code = $LASTEXITCODE
Remove-Item Env:BOOTSTRAP_PASSWORD
if ($code -ne 0) { Fail "Không tạo được tài khoản quản trị." }
Set-Content -Path (Join-Path $Root ".hana-installed") -Value (Get-Date -Format s)

Say "`n==========================================" Cyan
Say "  XONG. Đăng nhập bằng $email" Cyan
Say "  Tiếp theo trong ứng dụng:" Cyan
Say "   1. Cài đặt → Kênh phát hành: thêm kênh YouTube của bạn" Cyan
Say "   2. Nhân sự → Tạo tài khoản nhân viên (chọn vai trò Content / Editor / Leader)" Cyan
Say "   3. Gửi địa chỉ http://<IP máy này>:3000 + email/mật khẩu cho từng nhân viên" Cyan
Say "==========================================" Cyan
Read-Host (ConvertTo-Plain "Nhấn Enter để đóng")
