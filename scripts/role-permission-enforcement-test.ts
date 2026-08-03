/* eslint-disable no-console */
/**
 * DOKTOR/ASISTAN/BANKO/MUHASEBE için DB tabanlı yetki matrisinin (Rol
 * Yetkileri ekranı → role-permission-store.ts → rbac.can()) gerçekten
 * uygulandığını ve bir izin AÇILIP KAPATILDIĞINDA (kısa TTL cache sonrası,
 * yeniden giriş GEREKMEDEN) davranışın değiştiğini doğrular.
 *
 * Kullanım: npx tsx scripts/role-permission-enforcement-test.ts
 * Test sonunda RolePermissionConfig satırı orijinal haline geri yüklenir.
 */
import { PrismaClient } from "@prisma/client";
import { can } from "../src/lib/rbac";
import { getRolePermissionState, saveRolePermissionMap } from "../src/lib/role-permission-store";
import { DEFAULT_ROLE_PERMISSIONS } from "../src/lib/role-permissions";

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const original = await getRolePermissionState();
  console.log(`Mevcut yetki matrisi sürümü: ${original.version} (yedeklendi, test sonunda geri yüklenecek)`);

  try {
    // ── DOKTOR, ASISTAN, BANKO, MUHASEBE için birer okuma + birer yazma senaryosu ──
    const scenarios: { role: "DOKTOR" | "ASISTAN" | "BANKO" | "MUHASEBE"; allowedRead: string; allowedWrite: string; forbidden: string }[] = [
      { role: "DOKTOR",   allowedRead: "appointments:read", allowedWrite: "examinations:write", forbidden: "settings:write" },
      { role: "ASISTAN",  allowedRead: "patients:read",      allowedWrite: "appointments:write",  forbidden: "finance:write" },
      { role: "BANKO",    allowedRead: "appointments:read",  allowedWrite: "payments:write",       forbidden: "staff:write" },
      { role: "MUHASEBE", allowedRead: "appointments:read",  allowedWrite: "finance:write",        forbidden: "patients:write" },
    ];

    for (const s of scenarios) {
      const readOk = await can(s.role as any, s.allowedRead);
      assert(readOk, `${s.role}: varsayılan olarak sahip olması gereken "${s.allowedRead}" izni reddedildi.`);
      const writeOk = await can(s.role as any, s.allowedWrite);
      assert(writeOk, `${s.role}: varsayılan olarak sahip olması gereken "${s.allowedWrite}" izni reddedildi.`);
      const forbiddenOk = await can(s.role as any, s.forbidden);
      assert(!forbiddenOk, `${s.role}: sahip OLMAMASI gereken "${s.forbidden}" izni yanlışlıkla verildi.`);
      console.log(`✓ ${s.role}: okuma (${s.allowedRead}) ve yazma (${s.allowedWrite}) izinli, "${s.forbidden}" izinsiz — beklendiği gibi.`);
    }

    // ── İnce taneli izinler artık ilgili DELETE/istatistik route'larında gerçekten
    // enforce ediliyor (appointments:delete, examinations:delete,
    // installments:delete, dashboard:stats) — bkz. denetim raporu, bu izinler
    // önceden Rol Yetkileri ekranında görünüp kapatılabiliyordu ama hiçbir
    // route'ta ayrıca kontrol edilmiyordu. Varsayılan rollerin MEVCUT
    // davranışı (aşağıdaki beklenen değerler) kaybolmamalı.
    const fineGrainedExpectations: { role: "DOKTOR" | "ASISTAN" | "BANKO" | "MUHASEBE"; permission: string; expected: boolean }[] = [
      { role: "DOKTOR", permission: "appointments:delete", expected: true },
      { role: "ASISTAN", permission: "appointments:delete", expected: true },
      { role: "BANKO", permission: "appointments:delete", expected: true },
      { role: "MUHASEBE", permission: "appointments:delete", expected: false },
      { role: "DOKTOR", permission: "examinations:delete", expected: true },
      { role: "ASISTAN", permission: "examinations:delete", expected: false },
      { role: "DOKTOR", permission: "installments:delete", expected: true },
      { role: "ASISTAN", permission: "installments:delete", expected: true },
      { role: "BANKO", permission: "installments:delete", expected: true },
      { role: "MUHASEBE", permission: "installments:delete", expected: true },
      { role: "DOKTOR", permission: "dashboard:stats", expected: true },
      { role: "ASISTAN", permission: "dashboard:stats", expected: true },
      { role: "BANKO", permission: "dashboard:stats", expected: true },
      { role: "MUHASEBE", permission: "dashboard:stats", expected: true },
    ];
    for (const { role, permission, expected } of fineGrainedExpectations) {
      const actual = await can(role as any, permission);
      assert(actual === expected, `${role}: "${permission}" beklenen ${expected}, gerçek ${actual}.`);
    }
    console.log("✓ İnce taneli izinler (appointments:delete, examinations:delete, installments:delete, dashboard:stats) beklenen roller için doğru.");

    // ── MUHASEBE'nin appointments:read izni: middleware ARTIK bunu 403'lememeli ──
    // (bu script doğrudan can() çağırıyor, requireAuth() aynı can() fonksiyonunu
    // kullanıyor — middleware.ts bu path için artık hiçbir rol bazlı engel
    // uygulamıyor, bkz. src/middleware.ts.)
    assert(await can("MUHASEBE" as any, "appointments:read"), "MUHASEBE appointments:read izni beklenmedik şekilde false.");
    console.log("✓ MUHASEBE appointments:read: can() true dönüyor (middleware artık bunu engellemiyor).");

    // ── Rol Yetkileri ekranından bir izin AÇILDIĞINDA/KAPATILDIĞINDA, yeniden ──
    // giriş yapılmadan (JWT'de rol dışında bir şey taşınmıyor) davranış değişmeli.
    const beforeToggle = await can("MUHASEBE" as any, "appointments:write");
    assert(!beforeToggle, "Ön koşul hatası: MUHASEBE zaten appointments:write iznine sahip (varsayılan değişmiş olabilir).");

    const grantedMap = { ...original.map, MUHASEBE: [...original.map.MUHASEBE, "appointments:write"] };
    await saveRolePermissionMap(grantedMap, "role-permission-test");
    const afterGrant = await can("MUHASEBE" as any, "appointments:write");
    assert(afterGrant, "İzin Rol Yetkileri ekranından (saveRolePermissionMap) açıldı ama can() hâlâ false dönüyor — cache yenilenmiyor.");
    console.log("✓ İzin açıldıktan hemen sonra (yeniden giriş yapılmadan) can() = true.");

    await saveRolePermissionMap(original.map, "role-permission-test-revert");
    const afterRevert = await can("MUHASEBE" as any, "appointments:write");
    assert(!afterRevert, "İzin geri alındı ama can() hâlâ true dönüyor — cache yenilenmiyor.");
    console.log("✓ İzin kapatıldıktan hemen sonra can() = false.");

    // ── DEFAULT_ROLE_PERMISSIONS içindeki her rolün gerçekten normalizeRolePermissionMap'ten geçtiğini doğrula ──
    for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS)) {
      if (role === "SUPERADMIN" || role === "YONETICI") continue;
      const hasWildcard = await can(role as any, "*");
      assert(!hasWildcard || DEFAULT_ROLE_PERMISSIONS[role as keyof typeof DEFAULT_ROLE_PERMISSIONS].includes("*"), `${role}: beklenmedik şekilde "*" (tüm yetkiler) sahibi.`);
    }
    console.log("✓ Hiçbir klinik rolü (DOKTOR/ASISTAN/BANKO/MUHASEBE) yanlışlıkla '*' yetkisine sahip değil.");

    console.log("\nTüm yetki senaryoları doğrulandı.");
  } finally {
    // Orijinal yetki matrisini birebir geri yükle.
    await saveRolePermissionMap(original.map, original.updatedBy);
    console.log("Yetki matrisi orijinal haline geri yüklendi.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
