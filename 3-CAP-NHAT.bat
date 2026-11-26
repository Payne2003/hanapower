@echo off
rem Lay phien ban moi cua ung dung HANA MEDIA (giu nguyen du lieu).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update.ps1"
