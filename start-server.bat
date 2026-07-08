@echo off
setlocal
cd /d "%~dp0"

for %%I in ("C:\Program Files\PostgreSQL\18\bin\postgres.exe") do set "PG_BIN=%%~sI"
for %%I in ("%~dp0.pgdata") do set "PG_DATA=%%~sI"

set "PG_LISTENER="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5432" ^| findstr "LISTENING"') do set "PG_LISTENER=%%P"

if not defined PG_LISTENER (
	start "" /b "%PG_BIN%" -D "%PG_DATA%" -p 5432 >nul 2>&1
)

if not exist "%~dp0ecosystem.config.cjs" (
	echo PM2 ecosystem dosyasi bulunamadi: %~dp0ecosystem.config.cjs
	exit /b 1
)

npx pm2 resurrect >nul 2>&1
npx pm2 delete klinik-modern >nul 2>&1
npx pm2 delete klinik-modern-web >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /f /pid %%P >nul 2>&1
call npm run build
if errorlevel 1 exit /b 1
npx pm2 start ecosystem.config.cjs --only klinik-modern-web --update-env
npx pm2 save
