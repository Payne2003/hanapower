@echo off
rem Cai dat ung dung HANA MEDIA tren may nay (chi can chay 1 lan).
rem Yeu cau: Node.js 22 LTS va Docker Desktop dang chay.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1"
pause
