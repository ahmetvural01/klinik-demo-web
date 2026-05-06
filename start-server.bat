@echo off
setlocal
cd /d "%~dp0"

set "NEXT_BIN=%~dp0node_modules\next\dist\bin\next"

if not exist "%NEXT_BIN%" (
	echo Next.js binary bulunamadi: %NEXT_BIN%
	exit /b 1
)

npx pm2 resurrect >nul 2>&1
npx pm2 delete klinik-modern >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /f /pid %%P >nul 2>&1
if exist "%~dp0.next" rmdir /s /q "%~dp0.next" >nul 2>&1
npx pm2 start "%NEXT_BIN%" --name klinik-modern --cwd "%~dp0" -- dev -p 3000
npx pm2 save
