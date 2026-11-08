@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)
if not exist "kaldan-site\dist\routes.json" (
  echo Build the website first with: npm run build
  pause
  exit /b 1
)
node -e "fetch('http://127.0.0.1:8899/routes.json',{signal:AbortSignal.timeout(750)}).then(async r=>process.exit(r.ok&&Array.isArray(await r.json())?0:1)).catch(()=>process.exit(1))" >nul 2>nul
if errorlevel 1 start "Kaldan website server" cmd /k "node kaldan-site/server.mjs"
start "" "http://127.0.0.1:8899/"
echo The redesigned website is opening. Refresh once if the server is still starting.
echo Close the Kaldan website server window when finished.
