$ErrorActionPreference="Stop"
$Root=(Resolve-Path (Join-Path $PSScriptRoot "..")).Path;Set-Location $Root
if(-not(Test-Path package.json)){throw "Paketi package.json bulunan proje ana klasorune kopyalayin."}
foreach($c in @("node","npm")){if(-not(Get-Command $c -ErrorAction SilentlyContinue)){throw "$c bulunamadi."}}
$backup=Join-Path $Root ".ai-factory-backup";New-Item -ItemType Directory -Force $backup|Out-Null
foreach($f in @("package.json","package-lock.json",".gitignore")){if(Test-Path $f){Copy-Item $f (Join-Path $backup ($f+".before-v2")) -Force}}
if(Get-Command code -ErrorAction SilentlyContinue){code --install-extension saoudrizwan.claude-dev --force}
npm install -g cline
npm install --save-dev @playwright/test @axe-core/playwright @lhci/cli
npx playwright install chromium firefox webkit
if(Test-Path ".ai-factory"){Copy-Item ".ai-factory" (Join-Path $backup (".ai-factory-"+(Get-Date -Format yyyyMMdd-HHmmss))) -Recurse -Force}
Copy-Item (Join-Path $PSScriptRoot "payload") ".ai-factory" -Recurse -Force
New-Item -ItemType Directory -Force ".cline"|Out-Null
Copy-Item (Join-Path $PSScriptRoot "cline-project\*") ".cline" -Recurse -Force
New-Item -ItemType Directory -Force "tests\ai"|Out-Null
Copy-Item (Join-Path $PSScriptRoot "tests\*") "tests\ai" -Force
Copy-Item (Join-Path $PSScriptRoot "playwright.ai.config.ts") "." -Force
Write-Host "`nAI Factory v2 kuruldu: 150 uzman rol + provider failover politikalari." -ForegroundColor Green
Write-Host "Bir kez Cline provider/API baglantisini yapin. Yerel kotasiz motor icin YEREL_KOTASIZ_AI_KUR.cmd kullanin." -ForegroundColor Yellow
