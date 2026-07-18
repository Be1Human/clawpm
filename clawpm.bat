@echo off
chcp 65001 >nul
title ClawPM
cd /d %~dp0

:: Check node
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [FAIL] node not found. Please install Node.js first.
    pause
    exit /b 1
)

:: Build once if artifacts are missing
if not exist "server\dist\index.js" goto build
if not exist "web\dist\index.html" goto build
goto run

:build
echo [INFO] Build artifacts missing, running pnpm build (one-time)...
call pnpm build
if %errorlevel% neq 0 (
    echo [FAIL] Build failed, see errors above.
    pause
    exit /b 1
)

:run
echo ============================================
echo   ClawPM starting
echo   URL:  http://localhost:3210
echo   Token: dev-token (default)
echo   Close this window to stop the server.
echo ============================================
echo.

:: Open browser after 2 seconds
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3210"

node server\dist\index.js

echo.
echo Server stopped (exit code %errorlevel%).
pause
