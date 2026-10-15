@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 (
  set "STELLAR_NODE=node"
) else (
  set "STELLAR_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
"%STELLAR_NODE%" scripts\stop-local.mjs
pause
