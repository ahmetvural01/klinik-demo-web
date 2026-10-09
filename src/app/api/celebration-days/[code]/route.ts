import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// Bir kutlama gününü açmak, kurumun TÜM şubelerindeki uygun hastalara her
// yıl otomatik toplu mesaj göndermek demektir (bkz. src/lib/celebration-sms.ts).
// Bu yüzden tek seferlik toplu gönderimle aynı yüksek riskli "sms:bulk"
// yetkisi istenir; önceden metin düzenleme yetkisi (sms:write veya
// whatsapp:write) yetiyordu.
export async function PATCH(req: NextRequest, props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("sms:bulk");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları güncelleyebilir." }, { status: 403 });
  }

  const day = await prisma.celebrationDay.findUnique({ where: { code: params.code } });
  if (!day || !day.isActive) {
    return NextResponse.json({ message: "Kutlama günü bulunamadı" }, { status: 404 });
  }

  const body = await req.json().catch(() => null) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ message: "Açık/kapalı bilgisi eksik." }, { status: 400 });
  }
  const enabled = body.enabled;

  const setting = await prisma.celebrationDaySetting.upsert({
    where: { institutionId_celebrationCode: { institutionId: auth.user.institutionId, celebrationCode: params.code } },
    update: { enabled },
    create: { institutionId: auth.user.institutionId, celebrationCode: params.code, enabled },
  });

  await writeAudit(
    auth.user.id,
    "CELEBRATION_DAY_TOGGLE",
    `Kutlama günü ${enabled ? "açıldı" : "kapatıldı"}: ${day.title} (${day.code})`,
  );

  return NextResponse.json(setting);
}
