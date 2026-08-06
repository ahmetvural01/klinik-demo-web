import { prisma } from "@/lib/prisma";
import { turkeyDateKey, turkeyTimeKey } from "@/lib/tz";
import type { Prisma } from "@prisma/client";

/**
 * Verilen doktor + zaman aralığı bir DoctorBlock (bloke edilmiş saat) ile
 * çakışıyorsa o bloğu döner, çakışma yoksa null. Randevu çakışma kontrolü
 * önceden yalnızca randevu-randevu çakışmasına bakıyordu, DoctorBlock hiç
 * dahil edilmiyordu (bkz. denetim raporu Tema 5).
 */
export async function findDoctorBlockConflict(
  doctorId: string,
  startAt: Date,
  endAt: Date,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const startDate = turkeyDateKey(startAt);
  const endDate = turkeyDateKey(endAt);
  const startTime = turkeyTimeKey(startAt);
  const endTime = turkeyTimeKey(endAt);

  const blocks = await client.doctorBlock.findMany({
    where: {
      doctorId,
      date: startDate === endDate ? startDate : { in: [startDate, endDate] },
    },
    select: { id: true, date: true, startTime: true, endTime: true, reason: true },
  });

  return (
    blocks.find((b) => {
      if (b.date !== startDate && b.date !== endDate) return false;
      return b.startTime < endTime && b.endTime > startTime;
    }) || null
  );
}
