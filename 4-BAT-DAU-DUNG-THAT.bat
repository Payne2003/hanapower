@echo off
rem XOA du lieu mau, tao doanh nghiep va tai khoan quan tri that.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\go-live.ps1"
