$ErrorActionPreference="Stop"
$Root=(Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path;Set-Location $Root
Write-Host "KlinikModern AI Factory v2 — 150 uzman" -ForegroundColor Cyan
node ".ai-factory\runtime\dispatcher.cjs" full
if(-not(Get-Command cline -ErrorAction SilentlyContinue)){Write-Host "Cline CLI yok. KURULUMU_BASLAT.cmd calistirin." -ForegroundColor Red;exit 1}
$prompt=@"
You are the executive coordinator of KlinikModern AI Software Factory v2.
Read `.cline/rules`, `.cline/agents`, `.ai-factory/config/agent-registry.json`, and the repository.
There are 150 specialist roles. Do NOT run all simultaneously. Build a task board and activate only relevant specialists.
Separate implementation from independent review/red-team.
Priority: tenant/security/data integrity > broken workflows > correctness > UX/accessibility > performance > polish.
Use deterministic tools and Playwright. Do not mark success without evidence.
Never expose secrets, push remotely, bypass quotas, or enable paid escalation unless AI_ALLOW_PAID=1.
When a provider is quota-limited, continue eligible work on another configured tier or local Ollama.
Begin with a full audit and prioritized work graph.
"@
cline --team-name klinikmodern-factory-v2 $prompt
