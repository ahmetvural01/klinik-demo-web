$ErrorActionPreference="Stop"
if(Get-Command ollama -ErrorAction SilentlyContinue){Write-Host "Ollama zaten kurulu." -ForegroundColor Green;ollama --version;exit}
if(Get-Command winget -ErrorAction SilentlyContinue){
 winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
 Write-Host "Ollama kuruldu. Donanima uygun coding model ayrica secilecek." -ForegroundColor Green
}else{Write-Host "winget yok; Ollama otomatik kurulamadi." -ForegroundColor Red;exit 1}
