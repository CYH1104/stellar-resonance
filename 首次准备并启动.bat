@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24.12 or newer, then run this file again.
  pause
  exit /b 1
)
node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major<24||(major===24&&minor<12)?1:0)"
if errorlevel 1 (
  echo Node.js 24.12 or newer is required.
  pause
  exit /b 1
)
echo Installing dependencies. This may take a few minutes.
call npm install --ignore-scripts --package-lock=false --no-audit --no-fund
if errorlevel 1 goto failed
call npm run build
if errorlevel 1 goto failed
node scripts/launch-local.mjs
if errorlevel 1 goto failed
set /p STELLAR_URL=<"server\.local\url.txt"
start "" "%STELLAR_URL%"
exit /b 0
:failed
echo Preparation failed. Keep this window open and share the error text.
pause
exit /b 1
