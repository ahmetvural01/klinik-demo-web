import assert from "node:assert/strict";
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

// Gerçek giriş uçlarını (klinik giriş ekranı, /superadmin ekranı ve ortak
// platform-auth) yalıtılmış depolama/oturum bağımlılıklarıyla çalıştırır.
//
// Sistem sahibinin kuralı:
//  - Klinik giriş ekranı + süperadmin kimliği + kurum adı → o kliniğe GİZLİ ve
//    tam yetkili girer; bu ekran Platform panelini ASLA açmaz.
//  - Kliniğe yansıyan ad kliniğin yöneticisidir; sahibin kimliği yalnız
//    belirtecin ayrı alanlarında (ghostOwnerId/ghostOwnerName) durur.
//  - /superadmin ekranı Platform panelini açar.
const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const tag = randomUUID();
const state = { platform: true, active: true, twoFactor: false, blocked: false, queries: [], tokens: [], cookies: [], failures: [], audits: [] };
globalThis.__authLoginRoutingTest = state;
const mocks = {
  prisma: `const s=globalThis.__authLoginRoutingTest;
    export const prisma={user:{async findFirst(args){s.queries.push(args.where);
      if(args.where.role==='SUPERADMIN')return s.platform&&(!args.where.isActive||s.active)?{id:'platform',role:'SUPERADMIN',fullName:'Platform',passwordHash:'platform-password',tokenVersion:1,twoFactorEnabled:s.twoFactor}:null;
      return {id:'clinic',role:'YONETICI',institutionId:'institution',fullName:'Clinic',passwordHash:'clinic-password',tokenVersion:1,twoFactorEnabled:false,branchMemberships:[{id:'branch'}]};
    }},institution:{async findFirst(args){if(args?.where?.name?.equals==='yok')return null;return {id:'institution',name:'whitedental',isActive:true,isDemo:false};},async findUnique(){return {id:'institution',name:'whitedental'};}}};`,
  auth: `const s=globalThis.__authLoginRoutingTest;
    export const verifyPassword=async(password,hash)=>password===hash;
    export const signToken=payload=>{s.tokens.push(payload);return 'synthetic-session';};
    export const setAuthCookie=async token=>{s.cookies.push(token);};
    export const signPendingTwoFactorToken=async id=>'pending-'+id;
    export const setGhostAuthCookie=async token=>{s.cookies.push('ghost:'+token);};
    export const clearRolePreviewCookie=async()=>{};`,
  api: `const s=globalThis.__authLoginRoutingTest;export const writeAudit=async(...args)=>{s.audits.push(args);};`,
  metrics: `export const metricIncrement=()=>{};export const metricObserve=()=>{};`,
  "rate-limit": `export const checkRateLimit=async()=>({ok:true});export const getClientIpFromHeaders=()=> 'test-ip';`,
  "security-store": `const s=globalThis.__authLoginRoutingTest;export const isFailureBlocked=async()=>s.blocked;export const clearFailures=async()=>{};export const recordFailure=async key=>{s.failures.push(key);};`,
};

const outputs = [];
async function bundle(entry, name) {
  const outfile = path.join(process.cwd(), `.auth-login-regression-${name}-${tag}.cjs`);
  outputs.push(outfile);
  await build({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", packages: "external",
    plugins: [{ name: "auth-regression-dependencies", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\// }, args => {
        const lib = args.path.slice("@/lib/".length);
        return mocks[lib] ? { path: lib, namespace: "auth-fixture" } : { path: path.join(process.cwd(), "src/lib", lib + ".ts") };
      });
      builder.onLoad({ filter: /.*/, namespace: "auth-fixture" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }],
  });
  return require(outfile);
}

function reset() {
  state.queries.length = 0; state.tokens.length = 0; state.cookies.length = 0; state.failures.length = 0; state.audits.length = 0;
}

try {
  const clinicRoute = await bundle("src/app/api/auth/login/route.ts", "clinic");
  const platformRoute = await bundle("src/app/api/auth/superadmin/login/route.ts", "platform");
  const platformLib = await bundle("src/lib/platform-auth.ts", "lib");

  async function clinicLogin(password, institution = "whitedental") {
    reset();
    return clinicRoute.POST(new NextRequest("https://cepklinik.test/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ institution, identityNo: "00000000000", password }) }));
  }
  async function platformLogin(password) {
    reset();
    return platformRoute.POST(new NextRequest("https://cepklinik.test/api/auth/superadmin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identityNo: "00000000000", password }) }));
  }
  const noSession = () => { assert.equal(state.tokens.length, 0, "Hiçbir oturum açılmamalı"); assert.equal(state.cookies.length, 0); };

  // 1) Klinik ekranı + süperadmin + klinik adı → o kliniğe gizli, tam yetkili giriş
  let response = await clinicLogin("platform-password");
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.notEqual(body.role, "SUPERADMIN", "Klinik ekranı Platform paneline yönlendirecek yanıt vermemeli");
  assert.equal(body.role, "YONETICI");
  assert.deepEqual(body.clinic, { id: "institution", name: "whitedental" });
  assert.equal(state.tokens.length, 2, "Platform oturumu (panele dönüş) ve klinik (gizli) oturumu");
  const platformToken = state.tokens.find(token => !token.ghost);
  const ghostToken = state.tokens.find(token => token.ghost);
  assert.equal(platformToken.institutionId, null);
  assert(platformToken.superadminModules.length > 0);
  assert.equal(ghostToken.institutionId, "institution");
  assert.equal(ghostToken.role, "YONETICI");
  assert.equal(ghostToken.fullName, "Clinic", "Kliniğe yansıyan ad yöneticinin adı olmalı; sahibin adı yazılmamalı");
  assert.equal(ghostToken.ghostOwnerId, "platform");
  assert.equal(ghostToken.ghostOwnerName, "Platform");
  assert(state.cookies.some(cookie => String(cookie).startsWith("ghost:")));
  const start = state.audits.find(entry => entry[1] === "IMPERSONATE_START");
  assert(start, "Giriş Platform Denetim Günlüğü'ne yazılmalı");
  assert.deepEqual(start[3], { id: "platform", role: "SUPERADMIN", ghost: true }, "Giriş kaydı gerçek aktörle ve gizli giriş işaretiyle yazılmalı");

  // 2) "superadmin" / "admin" kurum adı klinik girişinde panel AÇMAZ
  for (const typed of ["superadmin", "admin", "SuperAdmin"]) {
    response = await clinicLogin("platform-password", typed);
    body = await response.json();
    assert.equal(response.status, 400, `"${typed}" klinik adı sayılmamalı`);
    assert.match(body.message, /\/superadmin/);
    noSession();
  }

  // 3) Olmayan klinik: açık hata, oturum yok
  response = await clinicLogin("platform-password", "yok");
  body = await response.json();
  assert.equal(response.status, 404);
  assert.match(body.message, /bulunamadı/);
  noSession();

  // 4) Yanlış şifre / aynı kimlikli klinik hesabının şifresi: kabul edilmez
  response = await clinicLogin("yanlis-sifre");
  assert.equal(response.status, 401);
  assert.equal(state.failures.length, 1);
  noSession();
  response = await clinicLogin("clinic-password");
  assert.equal(response.status, 401, "Aynı kimlikli klinik hesabının şifresi platform hesabı yerine kabul edilmemeli");
  assert.equal(state.failures.length, 1);
  noSession();
  assert(!state.queries.some(query => query.institutionId), "Platform kimliği klinik hesabına düşmemeli");

  // 5) 2FA açık: kod istenir; oturum kod sonrası açılır. Klinik adı kod ÖNCESİ doğrulanır.
  state.twoFactor = true;
  response = await clinicLogin("platform-password");
  body = await response.json();
  assert.equal(body.requiresTwoFactor, true);
  assert.equal(body.pendingToken, "pending-platform");
  noSession();
  response = await clinicLogin("platform-password", "superadmin");
  assert.equal(response.status, 400, "Geçersiz klinik adı için 2FA kodu istenmemeli");
  noSession();
  state.twoFactor = false;

  // 6) Pasif platform hesabı ve kilit
  state.active = false;
  response = await clinicLogin("clinic-password");
  assert.equal(response.status, 401, "Pasif platform hesabı klinik hesabına düşmemeli");
  noSession();
  state.active = true;
  state.blocked = true;
  response = await clinicLogin("platform-password");
  assert.equal(response.status, 429);
  noSession();
  state.blocked = false;

  // 7) /superadmin ekranı Platform panelini açar (gizli klinik oturumu AÇILMAZ)
  response = await platformLogin("platform-password");
  body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.role, "SUPERADMIN");
  assert.equal(body.institutionId, null);
  assert.equal(state.tokens.length, 1);
  assert.equal(state.tokens[0].institutionId, null);
  assert(state.tokens[0].superadminModules.length > 0);
  assert(!state.tokens.some(token => token.ghost));
  state.twoFactor = true;
  response = await platformLogin("platform-password");
  body = await response.json();
  assert.equal(body.requiresTwoFactor, true);
  noSession();
  state.twoFactor = false;
  response = await platformLogin("yanlis-sifre");
  assert.equal(response.status, 401);
  noSession();

  // 8) 2FA sonrası son adım (verify-2fa): kurum adı varsa klinik, yoksa panel
  const user = { id: "platform", role: "SUPERADMIN", fullName: "Platform", tokenVersion: 1, twoFactorEnabled: true };
  reset();
  response = await platformLib.completePlatformLogin(user, "whitedental", "Superadmin 2FA ile giris yapti");
  body = await response.json();
  assert.equal(body.role, "YONETICI");
  assert.deepEqual(body.clinic, { id: "institution", name: "whitedental" });
  assert(state.tokens.some(token => token.ghost && token.fullName === "Clinic" && token.ghostOwnerName === "Platform"));
  reset();
  response = await platformLib.completePlatformLogin(user, "", "Superadmin 2FA ile giris yapti");
  body = await response.json();
  assert.equal(body.role, "SUPERADMIN");
  assert(!state.tokens.some(token => token.ghost));
  reset();
  response = await platformLib.completePlatformLogin(user, "superadmin", "x");
  assert.equal(response.status, 400);
  noSession();

  // 9) Platform hesabı olmayan kimlik: normal kurum girişi değişmeden çalışır
  state.platform = false;
  response = await clinicLogin("clinic-password");
  body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.role, "YONETICI");
  assert.equal(state.tokens[0].institutionId, "institution");
  assert(!state.tokens[0].ghost);
  assert(state.queries.some(query => query.institutionId === "institution"));
  console.log("PASS: klinik ekranı panel açmaz, süperadmin kliniğe gizli ve tam yetkili girer (yönetici adıyla), olmayan klinik/yanlış şifre/2FA/kilit, /superadmin paneli ve normal kurum girişi.");
} finally {
  delete globalThis.__authLoginRoutingTest;
  for (const file of outputs) if (fs.existsSync(file)) fs.unlinkSync(file);
}
