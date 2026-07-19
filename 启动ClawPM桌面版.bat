@echo off
chcp 65001 >nul
setlocal
title ClawPM Desktop
cd /d "%~dp0"

echo Starting ClawPM Desktop...
call "C:\Program Files\nodejs\npx.cmd" --yes pnpm@10.26.1 dev:desktop

if errorlevel 1 (
  echo.
  echo ClawPM failed to start. Review the messages above.
  pause
)
