/* eslint-disable no-console */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { safeLoginNextPath as safeNext } from "../src/lib/routes";

const root = path.resolve(__dirname, "..");

function source(file: string) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function main() {
  const clinicLogin = source("src/app/api/auth/login/route.ts");
  assert(
    clinicLogin.includes("Bu hesapla klinik giriş ekranı kullanılamaz."),
    "Klinik girişi platform hesabını kabul etmemeli ve nötr bir hata döndürmeli.",
  );
  assert(
    !clinicLogin.includes("Süper yönetici hesabıyla") && !clinicLogin.includes("platform giriş ekranından"),
    "Normal klinik girişi platform rolünün adını veya ayrı yönetim yüzeyini ifşa etmemeli.",
  );
  assert(
    !clinicLogin.includes("Superadmin gizli erişim"),
    "Klinik girişi süperadmin için gizli veya alternatif bir oturum yolu içermemeli.",
  );
  assert(
    clinicLogin.includes("branchMemberships") &&
      clinicLogin.includes("where: { isActive: true, branch: { isActive: true } }"),
    "Klinik girişi aktif şube üyeliğini doğrulamalı.",
  );
  assert(
    clinicLogin.includes("await request.json().catch(() => null)"),
    "Klinik girişi bozuk JSON gövdesini kontrollü biçimde reddetmeli.",
  );
  // "İ" içeren kurum adı: toLowerCase() "İ"yi birleşik noktalı "i̇" yapıp
  // büyük/küçük harf duyarsız eşleşmeyi bozuyordu; arama yalnız trim ile yapılır.
  assert(
    !clinicLogin.includes("institution.toLowerCase()") && clinicLogin.includes("parsed.data.institution.trim()"),
    "Klinik girişi kurum adını aramadan önce küçük harfe çevirmemeli (Türkçe İ eşleşmesi bozulur).",
  );
  assert(
    clinicLogin.includes('toLocaleLowerCase("tr-TR")'),
    "Hatalı deneme anahtarı Türkçe küçük harfle kurulmalı.",
  );
  // Hata metni hangi alanın yanlış olduğunu söylemez ve platform kimliğinde de aynıdır.
  const loginFailure = "Kurum adı, TC kimlik no veya şifre hatalı.";
  assert(
    clinicLogin.includes(loginFailure) && !clinicLogin.includes("Kullanıcı adı veya şifre hatalı"),
    "Klinik girişi formdaki alan adlarıyla tek bir hata metni döndürmeli.",
  );
  assert(
    source("src/lib/platform-auth.ts").includes(loginFailure),
    "Klinik ekranından platform kimliğiyle yanlış şifre, kimliğin platform hesabı olduğunu sızdırmamalı.",
  );

  // Oturum bitince dönüş adresi (?next=): açık yönlendirme koruması.
  assert.equal(safeNext("/randevu?date=2026-10-10"), "/randevu?date=2026-10-10", "Panel yolu (sorgusuyla) kabul edilmeli.");
  for (const unsafe of ["//evil.example", "/\\evil.example", "https://evil.example", "evil", "/api/patients", "/klinik/giris", "/giris", "/superadmin/kurumlar", "", null, undefined]) {
    assert.equal(safeNext(unsafe), null, `Güvenli olmayan dönüş adresi reddedilmeli: ${String(unsafe)}`);
  }
  assert(
    source("src/components/auth/clinic-login-form.tsx").includes("safeLoginNextPath(next)"),
    "Giriş formu dönüş adresini yalnız güvenlik denetiminden geçirerek kullanmalı.",
  );
  // Oturum açık sayfada biterse (kabuk özeti 401) de kaldığı yere dönülür.
  const panelAlerts = source("src/components/layout/use-panel-alerts.ts");
  assert(
    panelAlerts.includes("safeLoginNextPath(") && panelAlerts.includes('"neden", "oturum"') && !panelAlerts.includes('location.assign("/klinik/giris")'),
    "Oturum sayfa açıkken bitince giriş ekranına ?next=…&neden=oturum ile gidilmeli.",
  );

  const superadminLogin = source("src/app/api/auth/superadmin/login/route.ts");
  assert(
    superadminLogin.includes("await request.json().catch(() => null)"),
    "Süperadmin girişi bozuk JSON gövdesini kontrollü biçimde reddetmeli.",
  );
  assert(
    superadminLogin.includes("twoFactorEnabled"),
    "Süperadmin girişi iki aşamalı doğrulama akışını korumalı.",
  );

  const verifySuperadminTwoFactor = source("src/app/api/auth/superadmin/verify-2fa/route.ts");
  assert(
    verifySuperadminTwoFactor.includes("!user.isActive") &&
      verifySuperadminTwoFactor.includes("prisma.user.updateMany"),
    "Süperadmin 2FA aktif hesabı doğrulamalı ve kodları atomik olarak sahiplenmeli.",
  );
  assert(
    verifySuperadminTwoFactor.includes("try") && verifySuperadminTwoFactor.includes("JSON.parse"),
    "Bozuk süperadmin yedek kod verisi kontrollü biçimde reddedilmeli.",
  );

  const verifyTwoFactor = source("src/app/api/auth/login/verify-2fa/route.ts");
  assert(
    verifyTwoFactor.includes("!user.institution?.isActive") &&
      verifyTwoFactor.includes("user.branchMemberships.length === 0"),
    "2FA tamamlanırken kurum ve aktif şube üyeliği yeniden doğrulanmalı.",
  );
  assert(
    verifyTwoFactor.includes("prisma.user.updateMany") &&
      verifyTwoFactor.includes("twoFactorLastStep"),
    "TOTP ve yedek kodlar atomik olarak sahiplenilmeli; eşzamanlı tekrar kullanılamamalı.",
  );
  // Platform oturumunun üretildiği TEK yer src/lib/platform-auth.ts (hem şifreli
  // hem 2FA'lı giriş ve klinik ekranından giriş aynı fonksiyonu kullanır).
  const platformAuth = source("src/lib/platform-auth.ts");
  assert(
    verifySuperadminTwoFactor.includes("completePlatformLogin")
      && platformAuth.includes("export async function startPlatformSession"),
    "Platform sahibi 2FA sonrası eksiksiz yönetim kapsamıyla oturum açmalı.",
  );

  const centralAuth = source("src/lib/api.ts");
  const branchContext = source("src/lib/branch-context.ts");
  assert(
    centralAuth.includes('user.role !== "SUPERADMIN" && !branchContext.activeBranchId'),
    "Aktif şube üyeliği oturum sırasında kaldırılan klinik kullanıcısı merkezi olarak reddedilmeli.",
  );
  assert(
    centralAuth.includes('user.actualRole === "SUPERADMIN" && !user.ghost'),
    "Çıplak platform oturumu klinik API izinlerine doğrudan erişememeli.",
  );
  assert(
    branchContext.includes("if (!context.activeBranch) return false"),
    "Boş şube bağlamı hiçbir şube iznini açık saymamalı.",
  );

  console.log("Auth güvenlik regresyon kontrolleri başarılı.");
}

main();
