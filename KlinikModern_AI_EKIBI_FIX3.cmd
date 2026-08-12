@echo off
setlocal EnableExtensions
chcp 65001 >nul
title KlinikModern AI Ekibi
set "SELF=%~f0"
set "TMPPS=%TEMP%\klinikmodern-ai-%RANDOM%-%RANDOM%.ps1"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$f=[IO.File]::ReadAllText($env:SELF); $m='###KLINIKMODERN_POWERSHELL_PAYLOAD_START###'; $i=$f.LastIndexOf($m); if($i -lt 0){throw 'Payload bulunamadi'}; [IO.File]::WriteAllText($env:TMPPS,$f.Substring($i+$m.Length),(New-Object Text.UTF8Encoding($false)))"

if errorlevel 1 (
  echo.
  echo [HATA] Kurucu payload'i hazirlanamadi.
  echo Dosya: %SELF%
  echo.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%TMPPS%"
set "EC=%ERRORLEVEL%"
del /q "%TMPPS%" >nul 2>&1

echo.
if not "%EC%"=="0" (
  echo [HATA] AI Ekibi hata kodu: %EC%
) else (
  echo [OK] Islem tamamlandi.
)
echo.
echo Bu pencere siz kapatana kadar acik kalacak.
pause
exit /b %EC%

###KLINIKMODERN_POWERSHELL_PAYLOAD_START###';$i=$f.LastIndexOf($m);if($i -lt 0){exit 90};$t=[IO.Path]::ChangeExtension([IO.Path]::GetTempFileName(),'.ps1');[IO.File]::WriteAllText($t,$f.Substring($i+$m.Length),(New-Object Text.UTF8Encoding($false)));try{& powershell -NoProfile -ExecutionPolicy Bypass -File $t;exit $LASTEXITCODE}finally{Remove-Item $t -Force -ErrorAction SilentlyContinue}"
set "EC=%ERRORLEVEL%"
echo.
if not "%EC%"=="0" echo Islem hata kodu: %EC%
pause
exit /b %EC%

###KLINIKMODERN_POWERSHELL_PAYLOAD_START###
$ErrorActionPreference = "Stop"
trap {
    Write-Host ""
    Write-Host "================ HATA ================" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host $_.InvocationInfo.PositionMessage -ForegroundColor Yellow
    Write-Host "======================================" -ForegroundColor Red
    exit 1
}

function Say($m,$c="Gray"){ Write-Host $m -ForegroundColor $c }
function OK($m){ Say ("[OK] " + $m) "Green" }
function INFO($m){ Say ("[..] " + $m) "Cyan" }
function WARN($m){ Say ("[!!] " + $m) "Yellow" }
function FAIL($m){ Say ("[FAIL] " + $m) "Red"; exit 1 }

$Root = Split-Path -Parent $env:SELF
Set-Location $Root

Say ""
Say "==================================================================" "Cyan"
Say " KLINIKMODERN AI YAZILIM EKIBI" "Cyan"
Say " Groq 120B + Ollama + Aider Repo-Map + 150 Uzman Rol" "Cyan"
Say " Kalici gorev kuyrugu + test + reviewer + Git rollback" "Cyan"
Say "==================================================================" "Cyan"

if (-not (Test-Path -LiteralPath (Join-Path $Root "package.json"))) {
    FAIL "Bu tek dosyayi C:\Projects\web-calisma (package.json bulunan klasor) icine koyun."
}

$Factory = Join-Path $Root ".ai-factory\pro"
$Tools = Join-Path $Factory "tools"
$RuntimePath = Join-Path $Factory "factory.py"
$RolesPath = Join-Path $Factory "roles.json"
$StatePath = Join-Path $Factory "state.json"
New-Item -ItemType Directory -Force $Factory,$Tools | Out-Null

# ------------------ prerequisites ------------------
INFO "Ortam kontrol ediliyor..."
$BrokenOldVenv = Join-Path $Tools "aider-venv"
if(Test-Path -LiteralPath $BrokenOldVenv){
    WARN "Onceki Python 3.14 ile yarim kalmis Aider ortami temizleniyor..."
    Remove-Item -LiteralPath $BrokenOldVenv -Recurse -Force -ErrorAction SilentlyContinue
}


$git = Get-Command git.exe -ErrorAction SilentlyContinue
if (-not $git) {
    if (Get-Command winget.exe -ErrorAction SilentlyContinue) {
        WARN "Git bulunamadi; tek seferlik Git kuruluyor..."
        & winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
        $gitCandidates = @(
            "$env:ProgramFiles\Git\cmd\git.exe",
            "$env:ProgramFiles\Git\bin\git.exe",
            "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
        )
        $gitPath = $gitCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if ($gitPath) { $env:PATH = (Split-Path $gitPath -Parent) + ";" + $env:PATH }
    }
}
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
    FAIL "Git otomatik kurulamadi. Windows winget/Git kurulumunu kontrol edin."
}
OK ("Git " + ((& git --version) -replace "^git version ",""))

# Aider'i resmi kurulum yontemiyle kur.
# Aider resmi dokumani Python 3.14 yerine ayrik Python 3.12 ortamı kullanmayi oneriyor.
# Resmi Windows installer uv + uygun Python 3.12'yi kendisi yonetir.
$AiderCmd = Get-Command aider.exe -ErrorAction SilentlyContinue

if (-not $AiderCmd) {
    INFO "Aider resmi Windows kurucusu ile izole Python 3.12 ortamına kuruluyor..."
    try {
        $installScript = Invoke-RestMethod "https://aider.chat/install.ps1" -TimeoutSec 60
        Invoke-Expression $installScript
    }
    catch {
        FAIL ("Aider resmi kurucusu indirilemedi/calismadi: " + $_.Exception.Message)
    }

    # Resmi installer PATH'i kalici gunceller; bu calisan oturuma da tekrar yukle.
    $machinePath = [Environment]::GetEnvironmentVariable("Path","Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path","User")
    $env:Path = "$machinePath;$userPath"

    # Yaygin uv/aider bin konumlarini da mevcut oturuma ekle.
    foreach($bin in @(
        (Join-Path $env:USERPROFILE ".local\bin"),
        (Join-Path $env:APPDATA "Python\Scripts"),
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Scripts")
    )){
        if(Test-Path -LiteralPath $bin){ $env:Path = "$bin;$env:Path" }
    }

    $AiderCmd = Get-Command aider.exe -ErrorAction SilentlyContinue
}

if (-not $AiderCmd) {
    # Son guvenli yol: uv varsa Aider latest'i Python 3.12 ile kur.
    $UvCmd = Get-Command uv.exe -ErrorAction SilentlyContinue
    if(-not $UvCmd){
        $uvCandidates = @(
            (Join-Path $env:USERPROFILE ".local\bin\uv.exe"),
            (Join-Path $env:LOCALAPPDATA "bin\uv.exe")
        )
        $uvPath = $uvCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if($uvPath){ $UvCmd = Get-Item -LiteralPath $uvPath }
    }

    if($UvCmd){
        WARN "Aider komutu PATH'te bulunamadi; uv ile Python 3.12 uzerine yeniden kuruluyor..."
        & $UvCmd.Source tool install --force --python 3.12 --with pip "aider-chat@latest"
        $machinePath = [Environment]::GetEnvironmentVariable("Path","Machine")
        $userPath = [Environment]::GetEnvironmentVariable("Path","User")
        $env:Path = "$machinePath;$userPath;$env:USERPROFILE\.local\bin"
        $AiderCmd = Get-Command aider.exe -ErrorAction SilentlyContinue
    }
}

if (-not $AiderCmd) {
    FAIL "Aider resmi kurulumdan sonra bulunamadi. Proje koduna dokunulmadi."
}

$Aider = $AiderCmd.Source
OK ("Aider " + ((& $Aider --version 2>$null | Select-Object -First 1) -join ""))

# ------------------ ensure local git safety ------------------
if (-not (Test-Path -LiteralPath (Join-Path $Root ".git"))) {
    INFO "Yerel guvenlik Git deposu olusturuluyor (remote push yapilmaz)..."
    & git init | Out-Null
}
& git config user.name "KlinikModern AI Factory"
& git config user.email "local-ai-factory@invalid.local"

# Ensure secrets/build outputs ignored without deleting user's gitignore.
$gitignore = Join-Path $Root ".gitignore"
$mustIgnore = @(
    ".env",
    ".env.*",
    "!.env.example",
    "!.env.production.example",
    "node_modules/",
    ".next/",
    ".ai-factory/",
    "playwright-report/",
    "coverage/"
)
$currentIgnore = if (Test-Path -LiteralPath $gitignore) { Get-Content -LiteralPath $gitignore -Raw } else { "" }
$append = @()
foreach($x in $mustIgnore) {
    if ($currentIgnore -notmatch ("(?m)^" + [regex]::Escape($x) + "\s*$")) { $append += $x }
}
if ($append.Count -gt 0) {
    Add-Content -LiteralPath $gitignore -Value ("`r`n# KlinikModern AI Factory safety`r`n" + ($append -join "`r`n"))
}
# Local snapshot. No push.
& git add -A
$hasStaged = & git diff --cached --name-only
if ($hasStaged) {
    & git commit -m "AI Factory safety snapshot before orchestration" --no-verify | Out-Null
}
OK "Yerel Git guvenlik snapshot'i hazir"

# ------------------ generate 150 logical specialist roles ------------------
$domains = @(
    @{n="Architecture"; d="system architecture, boundaries, modularity, dependency design"},
    @{n="Backend"; d="Next.js route handlers, services, server-side TypeScript"},
    @{n="Frontend"; d="React, Next.js App Router, components, state and forms"},
    @{n="Database"; d="Prisma, PostgreSQL, schema, queries, indexes, migrations"},
    @{n="Security"; d="authentication, authorization, secrets, OWASP, attack surface"},
    @{n="Tenant"; d="institution/branch isolation, cross-tenant leakage prevention"},
    @{n="Clinic"; d="patient, appointment, treatment, odontogram and clinical workflows"},
    @{n="Finance"; d="payments, installments, accounting, ledger, idempotency"},
    @{n="Stock"; d="inventory, purchases, lots, movements, firms and consistency"},
    @{n="Messaging"; d="SMS, WhatsApp, consent, dispatch, templates, webhooks"},
    @{n="UX"; d="information architecture, usability, visual consistency, interaction design"},
    @{n="Accessibility"; d="WCAG, keyboard, ARIA, focus, contrast and semantics"},
    @{n="QA"; d="test design, regression, integration, smoke and edge cases"},
    @{n="Performance"; d="Next.js performance, DB efficiency, caching, realtime and load"},
    @{n="DevOps"; d="build, deployment, observability, backup, rollback and production readiness"}
)
$levels = @(
    "Lead","Reviewer","Auditor","Implementer","Red Team",
    "Regression Specialist","Edge Case Specialist","Consistency Specialist","Refactor Specialist","Production Specialist"
)
$roles = @()
$id=1
foreach($domain in $domains){
    foreach($level in $levels){
        $roles += [ordered]@{
            id = ("R{0:D3}" -f $id)
            name = "$($domain.n) $level"
            domain = $domain.n
            specialty = $domain.d
            responsibility = "Act as a $level focused on $($domain.d). Prefer evidence from the repository, preserve existing business rules, and require deterministic verification."
        }
        $id++
    }
}
$roles | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $RolesPath -Encoding UTF8
OK "150 uzman rol havuzu hazir"

# ------------------ factory runtime ------------------
$runtime = @'
import os, sys, json, subprocess, time, re, shutil, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime

ROOT = Path.cwd()
BASE = ROOT / ".ai-factory" / "pro"
TOOLS = BASE / "tools"
ROLES_FILE = BASE / "roles.json"
STATE_FILE = BASE / "state.json"
LOGS = BASE / "logs"
LOGS.mkdir(parents=True, exist_ok=True)
AIDER = Path(os.environ.get("KLINIK_AIDER_BIN","aider"))
GROQ_KEY = os.environ.get("GROQ_API_KEY","")
OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

def sh(cmd, timeout=600, capture=True):
    p = subprocess.run(cmd, cwd=ROOT, shell=isinstance(cmd,str), text=True,
                       stdout=subprocess.PIPE if capture else None,
                       stderr=subprocess.STDOUT if capture else None,
                       timeout=timeout, encoding="utf-8", errors="replace")
    return p.returncode, p.stdout or ""

def npm_scripts():
    try:
        p=json.loads((ROOT/"package.json").read_text(encoding="utf-8"))
        return p.get("scripts",{})
    except Exception:
        return {}

SCRIPTS=npm_scripts()

def typecheck():
    if "typecheck" not in SCRIPTS: return True, 0, ""
    rc,out=sh("npm run typecheck", 420)
    count=len(re.findall(r"\berror TS\d+:",out))
    return rc==0,count,out[-16000:]

def lint_changed(files):
    code=[f for f in files if f.endswith((".ts",".tsx",".js",".mjs",".cjs")) and Path(f).exists()]
    if not code: return True,""
    quoted=" ".join('"'+f.replace('"','')+'"' for f in code[:40])
    rc,out=sh(f"npx eslint {quoted}",420)
    return rc==0,out[-12000:]

def prisma_validate():
    rc,out=sh("npx prisma validate",240)
    return rc==0,out[-8000:]

def git(*args):
    return sh(["git",*args],180)

def snapshot(label):
    git("add","-A")
    rc,out=git("diff","--cached","--name-only")
    if out.strip():
        git("commit","-m",label,"--no-verify")
    rc,head=git("rev-parse","HEAD")
    return head.strip()

def changed_since(commit):
    rc,out=git("diff","--name-only",commit,"HEAD")
    return [x.strip() for x in out.splitlines() if x.strip()]

def rollback(commit):
    git("reset","--hard",commit)
    # Do not use git clean. Only files tracked/committed by aider are reset safely.

def http_json(url, payload, headers=None, timeout=120):
    data=json.dumps(payload).encode()
    req=urllib.request.Request(url,data=data,headers=headers or {"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(req,timeout=timeout) as r:
            return json.loads(r.read().decode()), dict(r.headers)
    except urllib.error.HTTPError as e:
        body=e.read().decode(errors="replace")
        ex=RuntimeError(body)
        ex.status=e.code
        ex.headers=dict(e.headers)
        raise ex

def ollama_json(prompt, schema=None):
    payload={"model":"qwen2.5-coder:7b","messages":[{"role":"user","content":prompt}],
             "stream":False,"keep_alive":"30m","options":{"temperature":0,"num_ctx":8192}}
    if schema: payload["format"]=schema
    obj,_=http_json(OLLAMA_URL,payload,timeout=180)
    txt=obj.get("message",{}).get("content","")
    try: return json.loads(txt)
    except: return {"text":txt}

def groq_json(prompt, schema, max_tokens=900):
    if not GROQ_KEY: raise RuntimeError("NO_GROQ")
    payload={
        "model":"openai/gpt-oss-120b","temperature":0,"max_completion_tokens":max_tokens,
        "messages":[
            {"role":"system","content":"You are the planning controller of a professional software engineering team. Return only the required JSON."},
            {"role":"user","content":prompt}
        ],
        "response_format":{"type":"json_schema","json_schema":{"name":"response","strict":True,"schema":schema}}
    }
    while True:
        try:
            obj,_=http_json(GROQ_URL,payload,{
                "Authorization":f"Bearer {GROQ_KEY}",
                "Content-Type":"application/json"
            },timeout=180)
            txt=obj.get("choices",[{}])[0].get("message",{}).get("content","")
            return json.loads(txt)
        except RuntimeError as e:
            if getattr(e,"status",None)==429:
                msg=str(e)
                m=re.search(r"try again in ([\d.]+)s",msg,re.I)
                sec=max(5,int(float(m.group(1)))+2) if m else 30
                print(f"[KOTA] Groq {sec} saniye bekliyor...")
                time.sleep(sec)
                continue
            raise

def repo_summary():
    p=json.loads((ROOT/"package.json").read_text(encoding="utf-8"))
    dirs=[]
    for name in ["src","prisma","scripts","docs"]:
        d=ROOT/name
        if d.exists():
            dirs.append(f"{name}: {sum(1 for x in d.rglob('*') if x.is_file())} files")
    tc_ok,tc_count,tc_out=typecheck()
    return {
        "name":p.get("name"),"scripts":list(p.get("scripts",{}).keys()),
        "dependencies":{k:v for k,v in p.get("dependencies",{}).items() if k in ["next","react","@prisma/client","zod"]},
        "areas":dirs,"typecheck_errors":tc_count,"typecheck_tail":tc_out[-5000:]
    }

PLAN_SCHEMA={
 "type":"object",
 "properties":{
  "summary":{"type":"string"},
  "tasks":{"type":"array","minItems":1,"maxItems":8,"items":{
   "type":"object",
   "properties":{
    "title":{"type":"string"},
    "objective":{"type":"string"},
    "domains":{"type":"array","items":{"type":"string"}},
    "priority":{"type":"integer","minimum":1,"maximum":5},
    "acceptance":{"type":"array","items":{"type":"string"}},
    "suggested_tests":{"type":"array","items":{"type":"string"}}
   },
   "required":["title","objective","domains","priority","acceptance","suggested_tests"],
   "additionalProperties":False
  }}
 },
 "required":["summary","tasks"],"additionalProperties":False
}

REVIEW_SCHEMA={
 "type":"object",
 "properties":{
  "decision":{"type":"string","enum":["approve","reject"]},
  "reason":{"type":"string"},
  "risks":{"type":"array","items":{"type":"string"}}
 },
 "required":["decision","reason","risks"],"additionalProperties":False
}

def plan(mission):
    roles=json.loads(ROLES_FILE.read_text(encoding="utf-8-sig"))
    domains=sorted({r["domain"] for r in roles})
    summary=repo_summary()
    prompt=f"""User mission:
{mission}

Repository summary:
{json.dumps(summary,ensure_ascii=False)}

Available specialist domains:
{domains}

Create a small, executable engineering plan. Do not create cosmetic busywork.
First stabilize existing compiler/security/data-integrity problems if they block safe development.
For a broad "make the site professional" mission, cover correctness, security/tenant isolation,
core clinic workflows, UX/accessibility, QA and production readiness over successive tasks.
Use only npm scripts that exist in the repository for suggested_tests.
"""
    try: return groq_json(prompt,PLAN_SCHEMA,1100)
    except Exception as e:
        print("[PLAN] Groq kullanilamadi, yerel planlayici devrede:",str(e)[:160])
        local_schema=PLAN_SCHEMA
        return ollama_json(prompt,local_schema)

def select_roles(domains):
    roles=json.loads(ROLES_FILE.read_text(encoding="utf-8-sig"))
    selected=[]
    for d in domains:
        matches=[r for r in roles if r["domain"].lower()==str(d).lower()]
        selected += matches[:3]
    if not selected:
        selected=[r for r in roles if r["name"] in ["Architecture Lead","QA Reviewer","Security Auditor"]]
    seen=set(); out=[]
    for r in selected:
        if r["id"] not in seen:
            seen.add(r["id"]); out.append(r)
    return out[:6]

def valid_test_commands(task):
    allowed=[]
    for c in task.get("suggested_tests",[]):
        if c.startswith("npm run "):
            script=c[8:].strip().split()[0]
            if script in SCRIPTS: allowed.append(c)
        elif c=="npx prisma validate":
            allowed.append(c)
    return allowed[:3]

def aider_run(prompt, use_cloud=True):
    model="groq/openai/gpt-oss-120b" if use_cloud and GROQ_KEY else "ollama_chat/qwen2.5-coder:7b"
    args=[
        str(AIDER),
        "--model",model,
        "--weak-model","ollama_chat/qwen2.5-coder:7b",
        "--map-tokens","1800" if "groq/" in model else "1200",
        "--yes",
        "--no-stream",
        "--auto-commits",
        "--dirty-commits",
        "--analytics-disable",
        "--chat-language","tr",
        "--message",prompt
    ]
    env=os.environ.copy()
    env["OLLAMA_API_BASE"]="http://127.0.0.1:11434"
    # Aider/LiteLLM reads GROQ_API_KEY directly.
    p=subprocess.run(args,cwd=ROOT,env=env,text=True,stdout=subprocess.PIPE,
                     stderr=subprocess.STDOUT,encoding="utf-8",errors="replace",timeout=900)
    log=p.stdout or ""
    (LOGS/f"aider-{datetime.now().strftime('%Y%m%d-%H%M%S')}.log").write_text(log,encoding="utf-8")
    return p.returncode,log

def task_prompt(task, roles, baseline_errors, feedback=""):
    role_text="\n".join(f"- {r['name']}: {r['responsibility']}" for r in roles)
    acceptance="\n".join("- "+x for x in task.get("acceptance",[]))
    return f"""You are implementing one controlled task in KlinikModern, a production multi-tenant dental clinic SaaS.

SPECIALIST TEAM:
{role_text}

TASK:
{task['title']}
{task['objective']}

ACCEPTANCE:
{acceptance}

CURRENT BASELINE:
TypeScript compiler currently has {baseline_errors} known error(s). Do not create new compiler errors.
The LOCAL repository is authoritative. Do NOT replace local code with GitHub versions.
Inspect the repo map, imports, function signatures, Prisma schema and existing tests before changing code.

NON-NEGOTIABLE SAFETY:
- Preserve institutionId and branchId isolation.
- Preserve authentication/authorization and patient privacy.
- Preserve ledger/idempotency and financial integrity.
- Never expose/edit .env secrets.
- Never run prisma migrate reset, DROP DATABASE, git push, git reset --hard or destructive cleanup commands.
- Do not use `as any`, @ts-ignore or eslint-disable to hide errors.
- Reuse existing abstractions/tests before inventing duplicates.
- Make the smallest coherent production-quality change.
- Do not alter unrelated UI/business behavior.

{("PREVIOUS REVIEW/TEST FEEDBACK:\n"+feedback) if feedback else ""}
"""

def review_diff(commit, task, roles):
    rc,diff=git("diff",commit,"HEAD","--")
    if not diff.strip(): return {"decision":"reject","reason":"No code changes were produced.","risks":[]}
    diff=diff[-18000:]
    prompt=f"""Independent reviewer for task: {task['title']}
Review this diff. Approve only if it is coherent, does not weaken auth/tenant isolation/data integrity,
and directly advances the task. Reject type-hiding hacks, unrelated rewrites, or risky behavior changes.
DIFF:
{diff}
"""
    try:
        return ollama_json(prompt,REVIEW_SCHEMA)
    except Exception:
        return {"decision":"approve","reason":"Reviewer unavailable; deterministic tests decide.","risks":["reviewer unavailable"]}

def run_task(task):
    tc_ok,before_count,before_out=typecheck()
    checkpoint=snapshot("AI Factory checkpoint: "+task["title"][:80])
    roles=select_roles(task.get("domains",[]))
    print("\nUZMANLAR:",", ".join(r["name"] for r in roles))
    prompt=task_prompt(task,roles,before_count)
    rc,log=aider_run(prompt,True)

    if rc!=0 and ("429" in log or "rate limit" in log.lower() or "groq" in log.lower()):
        print("[FALLBACK] Bulut modeli kullanilamadi; yerel Ollama ile devam ediliyor.")
        rc,log=aider_run(prompt,False)

    changed=changed_since(checkpoint)
    if not changed:
        rollback(checkpoint)
        return False,"Kod degisikligi uretilmedi."

    review=review_diff(checkpoint,task,roles)
    if review.get("decision")!="approve":
        feedback=review.get("reason","Reviewer rejected.")
        print("[REVIEW] Ilk degisiklik reddedildi:",feedback)
        # Give one repair attempt using cloud/local.
        rc,log=aider_run(task_prompt(task,roles,before_count,feedback),True)
        review=review_diff(checkpoint,task,roles)
        if review.get("decision")!="approve":
            rollback(checkpoint)
            return False,"Reviewer ikinci denemeyi de reddetti: "+review.get("reason","")

    # Deterministic gates.
    after_ok,after_count,after_out=typecheck()
    if after_count>before_count:
        rollback(checkpoint)
        return False,f"Typecheck kotulesti: {before_count} -> {after_count}"

    changed=changed_since(checkpoint)
    lint_ok,lint_out=lint_changed(changed)
    if not lint_ok:
        feedback="Changed-file ESLint failed:\n"+lint_out[-7000:]
        print("[TEST] ESLint duzeltme denemesi...")
        aider_run(task_prompt(task,roles,before_count,feedback),True)
        lint_ok,lint_out=lint_changed(changed_since(checkpoint))
        after_ok,after_count,after_out=typecheck()
        if not lint_ok or after_count>before_count:
            rollback(checkpoint)
            return False,"ESLint/typecheck gate failed."

    if any(x.startswith("prisma/") for x in changed):
        p_ok,p_out=prisma_validate()
        if not p_ok:
            rollback(checkpoint)
            return False,"Prisma validate failed:\n"+p_out[-3000:]

    for cmd in valid_test_commands(task):
        rc,out=sh(cmd,600)
        if rc!=0:
            feedback=f"Acceptance test failed: {cmd}\n{out[-7000:]}"
            print("[TEST] Test hatasi icin bir duzeltme denemesi:",cmd)
            aider_run(task_prompt(task,roles,before_count,feedback),True)
            rc2,out2=sh(cmd,600)
            tc2_ok,tc2_count,_=typecheck()
            if rc2!=0 or tc2_count>before_count:
                rollback(checkpoint)
                return False,f"Acceptance test failed after repair: {cmd}"

    # Keep task changes and create explicit milestone commit if anything is dirty.
    snapshot("AI Factory accepted: "+task["title"][:80])
    return True,f"Accepted. TypeScript errors {before_count} -> {after_count}. Changed {len(changed)} file(s)."

def load_state():
    if STATE_FILE.exists():
        try:return json.loads(STATE_FILE.read_text(encoding="utf-8-sig"))
        except:pass
    return None

def save_state(s):
    STATE_FILE.write_text(json.dumps(s,ensure_ascii=False,indent=2),encoding="utf-8")

print("\n============================================================")
print(" KLINIKMODERN AI EKIBI HAZIR")
print("============================================================")
state=load_state()
if state and state.get("status")=="running":
    print("Yarim kalan gorev bulundu:",state.get("mission",""))
    ans=input("Devam edilsin mi? [E/h]: ").strip().lower()
    if ans not in ("h","hayir","n","no"):
        pass
    else:
        state=None

if not state or state.get("status")!="running":
    print("\nOrnek: Siteyi bastan sona profesyonel hale getir; once mevcut hatalari, sonra guvenlik, is akisları ve UI/UX'i iyilestir.")
    mission=input("\nNe yapmak istiyorsun? ").strip()
    if not mission:
        mission="KlinikModern projesini profesyonel production seviyesine getir. Önce mevcut typecheck ve kritik güvenlik/veri bütünlüğü sorunlarını düzelt, sonra temel klinik iş akışlarını, UI/UX ve erişilebilirliği iyileştir; mevcut testleri kullan."
    p=plan(mission)
    tasks=p.get("tasks") or []
    tasks.sort(key=lambda x:x.get("priority",3))
    state={"status":"running","mission":mission,"summary":p.get("summary",""),
           "tasks":[dict(t,status="pending",result="") for t in tasks],
           "createdAt":datetime.now().isoformat()}
    save_state(state)

print("\nPLAN:",state.get("summary",""))
for i,t in enumerate(state["tasks"],1):
    print(f"{i}. [{t['status']}] {t['title']}")

for idx,task in enumerate(state["tasks"]):
    if task.get("status")=="done": continue
    print("\n" + "="*64)
    print(f"GOREV {idx+1}/{len(state['tasks'])}: {task['title']}")
    print("="*64)
    task["status"]="running"; save_state(state)
    try:
        ok,msg=run_task(task)
    except KeyboardInterrupt:
        task["status"]="pending"; save_state(state); print("\nKullanici durdurdu. Sonraki acilista devam edilecek."); sys.exit(130)
    except Exception as e:
        ok=False; msg=f"{type(e).__name__}: {e}"
    task["status"]="done" if ok else "blocked"
    task["result"]=msg
    save_state(state)
    print("[SONUC]", "BASARILI" if ok else "BLOKE", "-",msg)

state["status"]="complete"
state["completedAt"]=datetime.now().isoformat()
save_state(state)

print("\n============================================================")
print(" OTURUM TAMAMLANDI")
print("============================================================")
for i,t in enumerate(state["tasks"],1):
    print(f"{i}. {t['status'].upper()}: {t['title']} -> {t.get('result','')}")
print("\nYeni bir hedef icin bu AYNI .cmd dosyasini yeniden calistirin.")
'@

[IO.File]::WriteAllText($RuntimePath,$runtime,(New-Object Text.UTF8Encoding($false)))
OK "Profesyonel orchestrator kuruldu"

# Old experimental launchers are no longer needed; delete only known files.
$old = @(
 "KlinikModern_AI_FABRIKA_TEK_DOSYA.cmd",
 "KlinikModern_AI_FABRIKA_FINAL.cmd",
 "KlinikModern_AI_FABRIKA_FINAL2.cmd",
 "KlinikModern_AI_FABRIKA_AKILLI.cmd",
 "KlinikModern_GITHUB_GUVENLI_ONARIM.cmd",
 "KlinikModern_GITHUB_GUVENLI_ONARIM_FIX.cmd",
 "KlinikModern_GITHUB_ONARIM_FINAL.cmd"
)
foreach($f in $old){
    $p=Join-Path $Root $f
    if(Test-Path -LiteralPath $p){
        try{
            if((Resolve-Path -LiteralPath $p).Path -ne (Resolve-Path -LiteralPath $env:SELF).Path){
                Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue
            }
        }catch{}
    }
}

Say ""
WARN "Not: Bulut modeller fiziksel olarak sinirsiz degildir. Groq kota/rate-limit durumunda sistem bekler veya yerel Ollama'ya gecer; yerel katmanda API kotasi yoktur."
Say ""
INFO "AI ekibi baslatiliyor..."
$env:KLINIK_AIDER_BIN = $Aider

$RuntimePython = $null
if(Get-Command python.exe -ErrorAction SilentlyContinue){
    $RuntimePython = (Get-Command python.exe).Source
}
elseif(Get-Command py.exe -ErrorAction SilentlyContinue){
    $RuntimePython = "py"
}
else{
    FAIL "Orchestrator icin Python komutu bulunamadi."
}

if($RuntimePython -eq "py"){
    & py $RuntimePath
}else{
    & $RuntimePython $RuntimePath
}
exit $LASTEXITCODE
