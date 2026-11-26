; Bộ cài Windows cho HANA MEDIA (tạo bằng NSIS: scripts/build-installer.sh).
; Bộ cài chép ứng dụng vào C:\HanaMedia rồi chạy scripts\setup.ps1 — script này tự cài
; Node.js, WSL, Docker Desktop (nếu thiếu), thư viện, máy chủ dữ liệu, dữ liệu mẫu và biểu tượng.
; Cài đè bản mới lên bản cũ: dữ liệu đã nhập được giữ nguyên.
Unicode True
!include "MUI2.nsh"
!include "x64.nsh"

!ifndef STAGE
  !error "Cần /DSTAGE=<thư mục mã nguồn đã chuẩn bị>"
!endif
!ifndef VERSION
  !define VERSION "0.3.0"
!endif

Name "HANA MEDIA"
OutFile "${OUTFILE}"
InstallDir "C:\HanaMedia"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "HANA MEDIA – Quản lý sản xuất video"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "HANA MEDIA"
VIAddVersionKey "FileDescription" "Bộ cài HANA MEDIA – Quản lý sản xuất video"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "HANA MEDIA"
VIAddVersionKey "LegalCopyright" "HANA MEDIA"

!define MUI_ICON "${STAGE}\public\icons\app.ico"
!define MUI_UNICON "${STAGE}\public\icons\app.ico"
!define MUI_WELCOMEPAGE_TITLE "Cài đặt HANA MEDIA"
!define MUI_WELCOMEPAGE_TEXT "Bộ cài sẽ tự động chuẩn bị mọi thứ để chạy ứng dụng trên máy này:$\r$\n$\r$\n• Node.js, WSL và Docker Desktop (nếu máy chưa có)$\r$\n• Máy chủ dữ liệu, cơ sở dữ liệu và dữ liệu mẫu$\r$\n• Biểu tượng HANA MEDIA trên màn hình$\r$\n$\r$\nCần kết nối Internet. Lần đầu có thể mất 20–40 phút và Windows có thể yêu cầu khởi động lại một lần — sau khi đăng nhập lại, cài đặt tự chạy tiếp."
!define MUI_FINISHPAGE_TITLE "Đã chép xong ứng dụng"
!define MUI_FINISHPAGE_TEXT "Một cửa sổ cài đặt sẽ mở ra và TỰ ĐỘNG chạy các bước còn lại. Hãy để cửa sổ đó chạy đến khi báo 'CÀI ĐẶT XONG'. Chọn 'Yes' nếu Windows hỏi quyền quản trị."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Vietnamese"

!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\HanaMedia"

Section "HANA MEDIA" SecMain
  SetOutPath "$INSTDIR"
  File /r "${STAGE}\*.*"
  WriteUninstaller "$INSTDIR\Go-cai-dat.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "HANA MEDIA – Quản lý sản xuất video"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "HANA MEDIA"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\public\icons\app.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Go-cai-dat.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  ; Chạy phần cài đặt tự động (không chờ — cửa sổ PowerShell hiện tiến trình)
  ${If} ${RunningX64}
    ${DisableX64FSRedirection}
  ${EndIf}
  Exec '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\setup.ps1"'
  ${If} ${RunningX64}
    ${EnableX64FSRedirection}
  ${EndIf}
SectionEnd

Section "Uninstall"
  ; Tắt máy chủ dữ liệu (dữ liệu vẫn được Docker giữ lại cho lần cài sau)
  nsExec::Exec 'cmd /c cd /d "$INSTDIR" && npx --yes supabase@2.122.1 stop'
  Delete "$DESKTOP\HANA MEDIA.lnk"
  Delete "$SMPROGRAMS\HANA MEDIA.lnk"
  DeleteRegKey HKCU "${UNINST_KEY}"
  RMDir /r "$INSTDIR"
SectionEnd
