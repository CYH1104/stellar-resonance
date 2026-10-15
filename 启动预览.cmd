@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 (
  set "STELLAR_NODE=node"
) else (
  set "STELLAR_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
if "%STELLAR_NODE%"=="node" goto launch
if not exist "%STELLAR_NODE%" (
  echo Please install Node.js 24.12 or newer.
  pause
  exit /b 1
)
:launch
"%STELLAR_NODE%" scripts\launch-local.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
set /p STELLAR_URL=<"server\.local\url.txt"
start "" "%STELLAR_URL%"
exit /b 0
