/* eslint-disable no-console */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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
  assert(
    verifySuperadminTwoFactor.includes("DEFAULT_SUPERADMIN_MODULES")
      && verifySuperadminTwoFactor.includes("superadminModules: modules"),
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
