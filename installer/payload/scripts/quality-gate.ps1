$ErrorActionPreference="Continue"
$Root=(Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path; Set-Location $Root
$fail=@(); $pkg=Get-Content package.json -Raw|ConvertFrom-Json
function Gate($n,$cmd){Write-Host "`n--- $n ---" -ForegroundColor Cyan; Invoke-Expression $cmd;if($LASTEXITCODE-ne 0){$script:fail+=$n;Write-Host "FAIL" -ForegroundColor Red}else{Write-Host "PASS" -ForegroundColor Green}}
if($pkg.scripts.typecheck){Gate "typecheck" "npm run typecheck"}
if($pkg.scripts.lint){Gate "lint" "npm run lint"}
if(Test-Path "prisma\schema.prisma"){Gate "prisma validate" "npx prisma validate"}
Gate "npm audit high+" "npm audit --audit-level=high"
if($pkg.scripts.build){Gate "production build" "npm run build"}
if($fail.Count){Write-Host ("FAILED: "+($fail-join ", ")) -ForegroundColor Red;exit 1}else{Write-Host "QUALITY GATE PASS" -ForegroundColor Green}
