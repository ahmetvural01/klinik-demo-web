/**
 * UYARI: YALNIZ TEST VERİTABANINDA ÇALIŞTIRIN. Test, Rol Yetkileri matrisine
 * geçici olarak yazar; sonunda RolePermissionConfig satırını (sürüm ve
 * "kaydeden" dahil) ilk haline geri yükler — kurulum koddaki varsayılanı
 * izliyorsa izlemeye devam eder.
 *
 * DOKTOR/ASISTAN/BANKO/MUHASEBE için DB tabanlı yetki matrisinin (Rol
 * Yetkileri ekranı → role-permission-store.ts → rbac.can()) güncel varsayılan
 * matrisle uygulandığını ve bir izin AÇILIP KAPATILDIĞINDA (süreç içi önbellek
 * kayıtta anında silinir; yeniden giriş GEREKMEDEN) davranışın değiştiğini doğrular.
 *
 * Kullanım: DATABASE_URL=<test veritabanı> npx tsx scripts/role-permission-enforcement-test.ts
 */
import { Prisma } from "@prisma/client";
import { can } from "../src/lib/rbac";
import { getRolePermissionState, saveRolePermissionMap } from "../src/lib/role-permission-store";
import { DEFAULT_ROLE_PERMISSIONS } from "../src/lib/role-permissions";
import { prisma } from "../src/lib/prisma";

type ClinicRole = "DOKTOR" | "ASISTAN" | "BANKO" | "MUHASEBE";

function log(message: string) {
  process.stdout.write(`${message}\n`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  // Ham satır: geri yüklemede sürüm ve "kaydeden" de korunur (kaydetme sürümü
  // artırıp kurulumu varsayılan güncellemelerinden koparırdı).
  const originalRow = await prisma.rolePermissionConfig.findUnique({ where: { id: 1 } });
  const original = await getRolePermissionState();
  log(`Mevcut yetki matrisi sürümü: ${original.version} (yedeklendi, test sonunda geri yüklenecek)`);

  try {
    // ── Her rol için günlük işinden bir okuma + bir yazma ve işine ait olmayan izinler ──
    const scenarios: { role: ClinicRole; allowedRead: string; allowedWrite: string; forbidden: string[] }[] = [
      { role: "DOKTOR",   allowedRead: "appointments:read", allowedWrite: "examinations:write", forbidden: ["settings:write", "payments:read", "finance:read", "patients:phone"] },
      { role: "ASISTAN",  allowedRead: "patients:read",     allowedWrite: "appointments:write", forbidden: ["finance:write", "finance:center", "payments:refund", "installments:write", "examinations:write", "prescriptions:write"] },
      { role: "BANKO",    allowedRead: "appointments:read", allowedWrite: "payments:write",     forbidden: ["staff:write", "payments:refund", "examinations:read", "finance:read"] },
      { role: "MUHASEBE", allowedRead: "finance:read",      allowedWrite: "finance:write",      forbidden: ["patients:write", "patients:read", "appointments:read", "examinations:read"] },
    ];

    for (const s of scenarios) {
      assert(await can(s.role, s.allowedRead), `${s.role}: varsayılan olarak sahip olması gereken "${s.allowedRead}" izni reddedildi.`);
      assert(await can(s.role, s.allowedWrite), `${s.role}: varsayılan olarak sahip olması gereken "${s.allowedWrite}" izni reddedildi.`);
      for (const forbidden of s.forbidden) {
        assert(!(await can(s.role, forbidden)), `${s.role}: sahip OLMAMASI gereken "${forbidden}" izni yanlışlıkla verildi.`);
      }
      log(`✓ ${s.role}: okuma (${s.allowedRead}) ve yazma (${s.allowedWrite}) izinli; ${s.forbidden.join(", ")} izinsiz.`);
    }

    // ── İnce taneli izinler (güncel matris) ──
    const fineGrainedExpectations: { role: ClinicRole; permission: string; expected: boolean }[] = [
      { role: "DOKTOR", permission: "appointments:delete", expected: false },
      { role: "ASISTAN", permission: "appointments:delete", expected: true },
      { role: "BANKO", permission: "appointments:delete", expected: true },
      { role: "MUHASEBE", permission: "appointments:delete", expected: false },
      { role: "DOKTOR", permission: "examinations:delete", expected: true },
      { role: "ASISTAN", permission: "examinations:delete", expected: false },
      { role: "DOKTOR", permission: "installments:delete", expected: false },
      { role: "ASISTAN", permission: "installments:delete", expected: false },
      { role: "BANKO", permission: "installments:delete", expected: false },
      { role: "MUHASEBE", permission: "installments:delete", expected: true },
      { role: "DOKTOR", permission: "dashboard:stats", expected: false },
      { role: "ASISTAN", permission: "dashboard:stats", expected: false },
      { role: "BANKO", permission: "dashboard:stats", expected: false },
      { role: "MUHASEBE", permission: "dashboard:stats", expected: false },
      { role: "BANKO", permission: "appointments:approve", expected: true },
      { role: "DOKTOR", permission: "appointments:approve", expected: false },
      { role: "MUHASEBE", permission: "earnings:read", expected: true },
      { role: "DOKTOR", permission: "prices:read", expected: true },
      { role: "ASISTAN", permission: "payments:write", expected: true },
      { role: "ASISTAN", permission: "patients:phone", expected: true },
      { role: "ASISTAN", permission: "finance:center", expected: false },
      { role: "MUHASEBE", permission: "prices:write", expected: false },
      { role: "MUHASEBE", permission: "stock:delete", expected: false },
      { role: "MUHASEBE", permission: "patients:read", expected: false },
    ];
    for (const { role, permission, expected } of fineGrainedExpectations) {
      const actual = await can(role, permission);
      assert(actual === expected, `${role}: "${permission}" beklenen ${expected}, gerçek ${actual}.`);
    }
    log("✓ İnce taneli izinler (iptal, taksit iptali, kurum özeti, online talep, hakediş, fiyat, asistan tahsilatı) güncel matrisle uyumlu.");

    // ── Rol Yetkileri ekranından bir izin AÇILDIĞINDA/KAPATILDIĞINDA, yeniden ──
    // giriş yapılmadan (JWT'de rol dışında bir şey taşınmıyor) davranış değişmeli.
    const beforeToggle = await can("MUHASEBE", "appointments:write");
    assert(!beforeToggle, "Ön koşul hatası: MUHASEBE zaten appointments:write iznine sahip (varsayılan değişmiş olabilir).");

    const grantedMap = { ...original.map, MUHASEBE: [...original.map.MUHASEBE, "appointments:write"] };
    const granted = await saveRolePermissionMap(grantedMap, "role-permission-test", original.version);
    assert(await can("MUHASEBE", "appointments:write"), "İzin Rol Yetkileri ekranından (saveRolePermissionMap) açıldı ama can() hâlâ false dönüyor — önbellek silinmiyor.");
    log("✓ İzin açıldıktan hemen sonra (yeniden giriş yapılmadan) can() = true.");

    await saveRolePermissionMap(original.map, "role-permission-test-revert", granted.version);
    assert(!(await can("MUHASEBE", "appointments:write")), "İzin geri alındı ama can() hâlâ true dönüyor — önbellek silinmiyor.");
    log("✓ İzin kapatıldıktan hemen sonra can() = false.");

    for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS)) {
      if (role === "SUPERADMIN" || role === "YONETICI") continue;
      const hasWildcard = await can(role as ClinicRole, "*");
      assert(!hasWildcard || DEFAULT_ROLE_PERMISSIONS[role as keyof typeof DEFAULT_ROLE_PERMISSIONS].includes("*"), `${role}: beklenmedik şekilde "*" (tüm yetkiler) sahibi.`);
    }
    log("✓ Hiçbir klinik rolü (DOKTOR/ASISTAN/BANKO/MUHASEBE) yanlışlıkla '*' yetkisine sahip değil.");

    log("\nTüm yetki senaryoları doğrulandı.");
  } finally {
    if (originalRow) {
      await prisma.rolePermissionConfig.update({
        where: { id: 1 },
        data: {
          version: originalRow.version,
          updatedBy: originalRow.updatedBy,
          map: originalRow.map as Prisma.InputJsonValue,
        },
      });
    } else {
      // Test başlarken satır yoktu (ilk okuma oluşturdu): kurulum varsayılanı izlesin diye silinir.
      await prisma.rolePermissionConfig.deleteMany({ where: { id: 1 } });
    }
    log("Yetki matrisi satırı (sürüm ve kaydeden dahil) ilk haline geri yüklendi.");
  }
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
