@echo off
chcp 65001 >nul
title ClawPM - Project Management Hub

echo ============================================
echo   ClawPM - Self-hosted PM with MCP
echo ============================================
echo.

:: Check if pnpm is available
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo [FAIL] pnpm not found. Please install: npm install -g pnpm
    echo        Or run: corepack enable
    pause
    exit /b 1
)

:: Check if node_modules exist
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    call pnpm install
    if %errorlevel% neq 0 (
        echo [FAIL] pnpm install failed
        pause
        exit /b 1
    )
)

:: Ensure data directory exists
if not exist "data" mkdir data

echo [OK] Starting ClawPM server (backend + frontend)...
echo.
echo   Backend API:  http://localhost:3210
echo   Frontend:     http://localhost:5173
echo   MCP SSE:      http://localhost:3210/mcp/sse
echo   Health Check: http://localhost:3210/health
echo.
echo   API Token:    dev-token (default)
echo.
echo   Press Ctrl+C to stop all services.
echo ============================================
echo.

:: Start backend and frontend concurrently
start "ClawPM-Server" cmd /c "cd /d %~dp0 && pnpm dev"
timeout /t 2 /nobreak >nul
start "ClawPM-Web" cmd /c "cd /d %~dp0 && pnpm dev:web"

echo [OK] Both services started in separate windows.
echo     Close this window or press any key to exit (services keep running).
pause >nul
