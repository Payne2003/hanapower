@echo off
rem Mo ung dung HANA MEDIA (http://localhost:3000). Giu cua so nay mo trong luc dung.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
pause
