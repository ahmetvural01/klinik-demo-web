import assert from "node:assert/strict";
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

// Run the actual two login handlers with isolated storage/auth dependencies.
const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const output = path.join(process.cwd(), `.auth-login-regression-${randomUUID()}.cjs`);
const state = { platform: true, active: true, twoFactor: false, blocked: false, queries: [], tokens: [], cookies: [], failures: [] };
globalThis.__authLoginRoutingTest = state;
const mocks = {
  prisma: `const s=globalThis.__authLoginRoutingTest;
    export const prisma={user:{async findFirst(args){s.queries.push(args.where);
      if(args.where.role==='SUPERADMIN')return s.platform&&(!args.where.isActive||s.active)?{id:'platform',role:'SUPERADMIN',fullName:'Platform',passwordHash:'platform-password',tokenVersion:1,twoFactorEnabled:s.twoFactor}:null;
      return {id:'clinic',role:'YONETICI',institutionId:'institution',fullName:'Clinic',passwordHash:'clinic-password',tokenVersion:1,twoFactorEnabled:false,branchMemberships:[{id:'branch'}]};
    }},institution:{async findFirst(){return {id:'institution',isActive:true,isDemo:false};}}};`,
  auth: `const s=globalThis.__authLoginRoutingTest;
    export const verifyPassword=async(password,hash)=>password===hash;
    export const signToken=payload=>{s.tokens.push(payload);return 'synthetic-session';};
    export const setAuthCookie=async token=>{s.cookies.push(token);};
    export const signPendingTwoFactorToken=async id=>'pending-'+id;`,
  api: `export const writeAudit=async()=>{};`,
  metrics: `export const metricIncrement=()=>{};export const metricObserve=()=>{};`,
  "rate-limit": `export const checkRateLimit=async()=>({ok:true});export const getClientIpFromHeaders=()=> 'test-ip';`,
  "security-store": `const s=globalThis.__authLoginRoutingTest;export const isFailureBlocked=async()=>s.blocked;export const clearFailures=async()=>{};export const recordFailure=async key=>{s.failures.push(key);};`,
};
try {
  await build({ entryPoints: ["src/app/api/auth/login/route.ts"], outfile: output, bundle: true, platform: "node", format: "cjs", packages: "external",
    plugins: [{ name: "auth-regression-dependencies", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\// }, args => {
        const name = args.path.slice("@/lib/".length);
        return mocks[name] ? { path: name, namespace: "auth-fixture" } : { path: path.join(process.cwd(), "src/lib", name + ".ts") };
      });
      builder.onLoad({ filter: /.*/, namespace: "auth-fixture" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }],
  });
  const { POST } = require(output);
  async function login(password, institution = "whitedental") {
    state.queries.length = 0; state.tokens.length = 0; state.cookies.length = 0; state.failures.length = 0;
    return POST(new NextRequest("https://cepklinik.test/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ institution, identityNo: "00000000000", password }) }));
  }
  let response = await login("platform-password");
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.role, "SUPERADMIN");
  assert.equal(body.id, "platform");
  assert.equal(state.tokens[0].institutionId, null);
  assert(state.tokens[0].superadminModules.length > 0);
  assert(!state.queries.some(query => query.institutionId), "Platform kimliği klinik hesabına düşmemeli");

  response = await login("clinic-password");
  assert.equal(response.status, 401, "Aynı kimlikli klinik hesabının şifresi platform hesabı yerine kabul edilmemeli");
  assert.equal(state.tokens.length, 0);
  assert.equal(state.cookies.length, 0);
  assert.equal(state.failures.length, 1);
  assert(!state.queries.some(query => query.institutionId));

  state.twoFactor = true;
  response = await login("platform-password");
  body = await response.json();
  assert.equal(body.requiresTwoFactor, true);
  assert.equal(body.pendingToken, "pending-platform");
  assert.equal(state.tokens.length, 0, "2FA tamamlanmadan oturum açılmamalı");
  assert.equal(state.cookies.length, 0);
  state.twoFactor = false;

  state.active = false;
  response = await login("clinic-password");
  assert.equal(response.status, 401, "Pasif platform hesabı klinik hesabına düşmemeli");
  assert.equal(state.tokens.length, 0);
  state.active = true;

  state.blocked = true;
  response = await login("platform-password");
  assert.equal(response.status, 429);
  assert.equal(state.tokens.length, 0);
  state.blocked = false;

  state.platform = false;
  response = await login("clinic-password");
  body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.role, "YONETICI");
  assert.equal(state.tokens[0].institutionId, "institution");
  assert(state.queries.some(query => query.institutionId === "institution"));
  console.log("PASS: süperadmin önceliği, klinik hesaba düşmeme, yanlış şifre, pasif hesap, 2FA, kilit ve normal kurum girişi.");
} finally {
  delete globalThis.__authLoginRoutingTest;
  if (fs.existsSync(output)) fs.unlinkSync(output);
}
