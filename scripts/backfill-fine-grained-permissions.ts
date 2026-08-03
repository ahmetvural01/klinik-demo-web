/* eslint-disable no-console */
/**
 * appointments:delete, examinations:delete, installments:delete ve
 * dashboard:stats artık ilgili route'larda GERÇEKTEN enforce ediliyor
 * (önceden Rol Yetkileri ekranında görünüp kapatılabilen ama hiçbir API'de
 * kontrol edilmeyen "işlevsiz" kutulardı — bkz. denetim raporu).
 *
 * src/lib/role-permissions.ts'teki DEFAULT_ROLE_PERMISSIONS güncellendi,
 * ama bu sabit yalnızca RolePermissionConfig tablosunda HİÇ satır yokken
 * kullanılır (bkz. role-permission-store.ts readState). Daha önce en az bir
 * kez kaydedilmiş (ya da varsayılanla otomatik oluşturulmuş) bir kurulumda
 * DB'deki eski map bu yeni izinleri içermez — bu script çalıştırılmazsa
 * DOKTOR/ASISTAN/BANKO deploy sonrası randevu/muayene/taksit SİLME
 * yeteneğini aniden kaybeder (var olan appointments:write vb. yetkileri
 * hâlâ dursa da yeni ayrı :delete izni eksik kalır).
 *
 * Bu script, halihazırda üst izne (ör. appointments:write) sahip olan her
 * rolün karşılık gelen yeni ince taneli izne de sahip olmasını GARANTİ eder
 * — mevcut özelleştirmelere dokunmaz, yalnızca eksik olanı ekler.
 *
 * Kullanım: npx tsx scripts/backfill-fine-grained-permissions.ts
 * Birden fazla kez çalıştırmak güvenlidir (idempotent).
 */
import { PrismaClient, Role } from "@prisma/client";
import { getRolePermissionState, saveRolePermissionMap } from "../src/lib/role-permission-store";

const prisma = new PrismaClient();

// [üst izin, ondan güvence altına alınacak yeni ince taneli izin]
const IMPLIED_PAIRS: [string, string][] = [
  ["appointments:write", "appointments:delete"],
  ["examinations:write", "examinations:delete"],
  ["installments:write", "installments:delete"],
  ["dashboard:read", "dashboard:stats"],
];

async function main() {
  const state = await getRolePermissionState();
  let changed = false;
  const nextMap: Record<string, string[]> = { ...state.map };

  for (const role of Object.keys(nextMap) as Role[]) {
    if (role === "SUPERADMIN" || role === "YONETICI") continue; // zaten "*"
    const perms = nextMap[role] || [];
    if (perms.includes("*")) continue;

    const additions: string[] = [];
    for (const [parent, child] of IMPLIED_PAIRS) {
      if (perms.includes(parent) && !perms.includes(child)) {
        additions.push(child);
      }
    }
    if (additions.length > 0) {
      nextMap[role] = [...perms, ...additions];
      changed = true;
      console.log(`${role}: eklendi -> ${additions.join(", ")}`);
    }
  }

  if (!changed) {
    console.log("Tüm roller zaten güncel — eklenecek bir şey yok.");
    return;
  }

  const saved = await saveRolePermissionMap(nextMap, "backfill-fine-grained-permissions");
  console.log(`Yetki matrisi güncellendi. Yeni sürüm: ${saved.version}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
