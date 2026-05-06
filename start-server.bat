@echo off
cd /d "%~dp0"
npx pm2 resurrect
timeout /t 2 /nobreak >nul
npx pm2 delete klinik-modern >nul 2>&1
npx pm2 start "%~dp0node_modules\next\dist\bin\next" --name klinik-modern -- dev -p 3000
npx pm2 save
