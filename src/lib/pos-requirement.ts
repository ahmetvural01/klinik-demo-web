import { prisma } from "@/lib/prisma";
import { requiresPos } from "@/lib/payment-methods";

/**
 * Kart / mail order tahsilatında POS seçimi yalnız klinikte (aktif şubede) en az
 * bir aktif POS cihazı tanımlıysa zorunludur. Önceden POS tanımlamamış klinik
 * kartla alınan tahsilatı hiç kaydedemiyordu (personel "Nakit" diye girip
 * kasayı bozuyordu). POS varsa seçilen cihaz Muhasebe'deki POS dökümüne yazılır.
 */
export async function posSelectionRequired(method: string | null | undefined, institutionId: string | null | undefined, branchId: string) {
  if (!requiresPos(method)) return false;
  const active = await prisma.posDevice.count({
    where: { ...(institutionId ? { institutionId } : {}), branchId, isActive: true },
  });
  return active > 0;
}
