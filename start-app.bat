@echo off
setlocal enableextensions
REM ============================================================
REM  Meatplus HRIS - Auto-start (backend + frontend)
REM  Put a SHORTCUT to this file in the Windows Startup folder
REM  (Win+R -> shell:startup) so the app runs when the laptop
REM  turns on. No terminal typing needed.
REM
REM  This script finds Laragon's PHP + Node by itself, so it
REM  uses the correct PHP (the one with pdo_pgsql for Supabase).
REM ============================================================

echo Starting Meatplus HRIS...

REM --- Locate Laragon's PHP and Node and put them first on PATH ---
set "LBIN=C:\laragon\bin"
set "PHP_DIR="
for /d %%i in ("%LBIN%\php\php-*") do set "PHP_DIR=%%i"
set "NODE_DIR=%LBIN%\nodejs"
for /d %%i in ("%LBIN%\nodejs\node-*") do set "NODE_DIR=%%i"
set "PATH=%PHP_DIR%;%NODE_DIR%;%LBIN%\nodejs;%PATH%"

REM --- Backend (Laravel API) -> http://localhost:8000 ---
REM  --host=0.0.0.0 makes it reachable from the LAN so the ZKTeco device
REM  can push attendance to http://<this-pc-ip>:8000/iclock/cdata
cd /d "C:\xampp\htdocs\meatplus-hris\backend"
start "Meatplus Backend" /min cmd /k "php artisan serve --host=0.0.0.0 --port=8000"

REM --- Frontend (Next.js) -> http://localhost:3000 ---
REM  PRODUCTION mode: build once on startup, then serve the optimized build.
REM  This is dramatically faster to load than "npm run dev" (no on-demand
REM  compiling, minified JS). The one-time build adds ~1-2 min to startup.
cd /d "C:\xampp\htdocs\meatplus-hris\frontend"
start "Meatplus Frontend" /min cmd /k "npm run build && npm run start"

echo.
echo Started! Two minimized windows are running the app.
echo Open http://localhost:3000 in your browser.
timeout /t 6 >nul
endlocal
