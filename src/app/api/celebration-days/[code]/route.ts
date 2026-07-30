import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("sms:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları güncelleyebilir." }, { status: 403 });
  }

  const day = await prisma.celebrationDay.findUnique({ where: { code: params.code } });
  if (!day || !day.isActive) {
    return NextResponse.json({ message: "Kutlama günü bulunamadı" }, { status: 404 });
  }

  const body = await req.json() as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ message: "enabled zorunlu" }, { status: 400 });
  }

  const setting = await prisma.celebrationDaySetting.upsert({
    where: { institutionId_celebrationCode: { institutionId: auth.user.institutionId, celebrationCode: params.code } },
    update: { enabled: body.enabled },
    create: { institutionId: auth.user.institutionId, celebrationCode: params.code, enabled: body.enabled },
  });

  await writeAudit(
    auth.user.id,
    "CELEBRATION_DAY_TOGGLE",
    `Kutlama günü ${body.enabled ? "açıldı" : "kapatıldı"}: ${day.title} (${day.code})`,
  );

  return NextResponse.json(setting);
}
