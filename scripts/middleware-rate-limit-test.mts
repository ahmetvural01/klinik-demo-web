// Middleware: API hız sınırı oturumlu isteklerde KULLANICI başına (aynı klinik
// ağındaki personel tek dış IP paylaşır), oturumsuzda IP başına; oturum
// doğrulama ve yönlendirme davranışı değişmeden kalır. Veritabanı gerekmez.
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";

process.env.JWT_SECRET = "test-secret-for-middleware-rate-limit-0123456789";
const { middleware } = await import("../src/middleware");

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
async function token(userId: string, extra: Record<string, unknown> = {}) {
  return new SignJWT({ userId, role: "YONETICI", institutionId: "inst", ...extra }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(secret);
}
function req(path: string, opts: { ip: string; cookie?: string }) {
  const headers = new Headers({ "x-forwarded-for": opts.ip });
  if (opts.cookie) headers.set("cookie", opts.cookie);
  return new NextRequest(new URL(`http://localhost${path}`), { headers });
}

const ipShared = "203.0.113.10";
const tokA = await token("user-a");
const tokB = await token("user-b");

// 1) Aynı IP'den iki kullanıcı: A 600 isteğe kadar geçer, 601. 429; B etkilenmez.
for (let i = 1; i <= 600; i += 1) {
  const res = await middleware(req("/api/patients", { ip: ipShared, cookie: `klinik_token=${tokA}` }));
  assert.notEqual(res.status, 429, `A ${i}. istek 429 almamalı`);
}
const a601 = await middleware(req("/api/patients", { ip: ipShared, cookie: `klinik_token=${tokA}` }));
assert.equal(a601.status, 429, "A 601. istekte 429 almalı");
const b1 = await middleware(req("/api/patients", { ip: ipShared, cookie: `klinik_token=${tokB}` }));
assert.notEqual(b1.status, 429, "Aynı IP'deki B kullanıcısı A'nın kovasından etkilenmemeli");
assert.equal(b1.headers.get("x-middleware-request-x-pathname"), "/api/patients", "Geçen istek x-pathname taşımalı");

// 2) Oturumsuz API: IP başına 400; 401 dönerken sayaç artar, 401. istekte 429.
const ipAnon = "198.51.100.77";
for (let i = 1; i <= 400; i += 1) {
  const res = await middleware(req("/api/patients", { ip: ipAnon }));
  assert.equal(res.status, 401, `Oturumsuz ${i}. istek 401 olmalı`);
}
const anon401 = await middleware(req("/api/patients", { ip: ipAnon }));
assert.equal(anon401.status, 429, "Oturumsuz 401. istek 429 almalı");

// Giriş ekranına yönlendirmede açılmak istenen yol `next`, sebep `neden=oturum`
// olarak taşınır (girişten sonra kaldığı yere dönüş); Next.js'in `_rsc` parametresi taşınmaz.
function assertClinicLoginRedirect(location: string | null, expectedNext: string, label: string) {
  const url = new URL(location || "", "http://localhost");
  assert.equal(url.pathname, "/klinik/giris", `${label}: giriş ekranına gitmeli`);
  assert.equal(url.searchParams.get("next"), expectedNext, `${label}: next kaldığı yolu taşımalı`);
  assert.equal(url.searchParams.get("neden"), "oturum", `${label}: neden=oturum olmalı`);
}

// 3) Geçersiz token: API 401 "Oturum geçersiz"; sayfa → /klinik/giris?next=… + çerez silme.
const bad = await middleware(req("/api/patients", { ip: "192.0.2.5", cookie: "klinik_token=bozuk.token.deger" }));
assert.equal(bad.status, 401);
assert.equal((await bad.json()).message, "Oturum geçersiz");
const badPage = await middleware(req("/randevu", { ip: "192.0.2.5", cookie: "klinik_token=bozuk.token.deger" }));
assert.equal(badPage.status, 307);
assertClinicLoginRedirect(badPage.headers.get("location"), "/randevu", "Geçersiz oturumlu sayfa");
assert.match(badPage.headers.get("set-cookie") || "", /klinik_token=;/);
const badSuperadmin = await middleware(req("/superadmin/kurumlar", { ip: "192.0.2.5", cookie: "klinik_token=bozuk.token.deger" }));
assert.equal(badSuperadmin.status, 307);
assert.match(badSuperadmin.headers.get("location") || "", /\/klinik\/giris$/, "Süperadmin yüzeyi next taşımaz (değişmedi)");

// 4) Geçerli token ile sayfa: geçer ve x-pathname taşır; oturumsuz sayfa → giriş.
const okPage = await middleware(req("/randevu", { ip: "192.0.2.6", cookie: `klinik_token=${tokA}` }));
assert.equal(okPage.status, 200);
assert.equal(okPage.headers.get("x-middleware-request-x-pathname"), "/randevu");
const noTokPage = await middleware(req("/randevu", { ip: "192.0.2.6" }));
assert.equal(noTokPage.status, 307);
assertClinicLoginRedirect(noTokPage.headers.get("location"), "/randevu", "Oturumsuz sayfa");
const noTokQuery = await middleware(req("/hasta-detay?id=p1&tab=finans&_rsc=abc", { ip: "192.0.2.6" }));
assertClinicLoginRedirect(noTokQuery.headers.get("location"), "/hasta-detay?id=p1&tab=finans", "Sorgulu oturumsuz sayfa");
const noTokSuperadmin = await middleware(req("/superadmin/kurumlar", { ip: "192.0.2.6" }));
assert.match(noTokSuperadmin.headers.get("location") || "", /\/superadmin$/, "Oturumsuz süperadmin sayfası /superadmin'e gitmeli (değişmedi)");

// 5) Ghost oturumu ayrı kova (aynı userId'li normal oturumla karışmaz) ve public yol çalışır.
const ghost = await token("user-a", { ghost: true });
const g1 = await middleware(req("/api/patients", { ip: ipShared, cookie: `klinik_ghost_token=${ghost}` }));
assert.notEqual(g1.status, 429, "Ghost oturumu normal oturumun dolu kovasını paylaşmamalı");
const pub = await middleware(req("/randevu-al/ornek", { ip: "192.0.2.9" }));
assert.equal(pub.status, 200, "Herkese açık sayfa oturumsuz açılmalı");

console.log("Middleware hız sınırı ve oturum testleri GEÇTİ.");
