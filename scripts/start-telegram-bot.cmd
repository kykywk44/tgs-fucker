@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0.."
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" scripts\telegram-pack-bot.py
) else (
  py -3 scripts\telegram-pack-bot.py
)
pause
