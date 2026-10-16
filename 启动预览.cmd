@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 (
  set "STELLAR_NODE=node"
) else (
  set "STELLAR_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
if not exist "dist\index.html" (
  echo Build missing. Run pnpm install and pnpm build first.
  pause
  exit /b 1
)
if "%STELLAR_NODE%"=="node" goto launch
if not exist "%STELLAR_NODE%" (
  echo Please install Node.js 24.12 or newer, then run this file again.
  pause
  exit /b 1
)
:launch
echo Open http://127.0.0.1:5173/ in your browser.
echo Keep this window open. Press Ctrl+C to stop.
"%STELLAR_NODE%" preview.mjs
pause
