import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeInstitution, requireAuth, writeAudit } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("lab:write");
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  const { description, sentAt, sentNote } = body;

  if (typeof description !== "string" || !description.trim() || description.length > 180) return NextResponse.json({ error: "Gönderilen iş bilgisi zorunludur." }, { status: 400 });
  if (sentNote !== undefined && sentNote !== null && (typeof sentNote !== "string" || sentNote.length > 1000)) {
    return NextResponse.json({ error: "Gönderim notu geçersiz" }, { status: 400 });
  }
  if (sentAt !== undefined && sentAt !== null && (typeof sentAt !== "string" || Number.isNaN(new Date(sentAt).getTime()))) {
    return NextResponse.json({ error: "Gönderim tarihi geçersiz" }, { status: 400 });
  }

  const order = await (prisma as any).labOrder.findFirst({
    where: {
      id: params.id,
      ...(auth.user.role !== "SUPERADMIN" ? { patient: { institutionId: auth.user.institutionId } } : {}),
    },
    select: { id: true, status: true },
  });
  if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
  if (order.status !== "DEVAM_EDIYOR") {
    return NextResponse.json({ error: "Tamamlanmış veya iptal edilmiş siparişe yeni laboratuvar adımı eklenemez" }, { status: 400 });
  }

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const updatedOrder = await (prisma as any).$transaction(async (tx: any) => {
        await tx.$queryRaw`SELECT "id" FROM "LabOrder" WHERE "id" = ${params.id} FOR UPDATE`;
        const currentOrder = await tx.labOrder.findUnique({
          where: { id: params.id },
          select: { status: true },
        });
        if (!currentOrder || currentOrder.status !== "DEVAM_EDIYOR") {
          throw new Error("LAB_ORDER_NOT_ACTIVE");
        }
        const last = await tx.labTrip.findFirst({
          where: { labOrderId: params.id },
          orderBy: { order: "desc" },
          select: { order: true },
        });
        const nextOrder = (last?.order ?? 0) + 1;

        await tx.labTrip.create({
          data: {
            labOrderId: params.id,
            order: nextOrder,
            description: description.trim(),
            sentAt: sentAt ? new Date(sentAt) : new Date(),
            sentNote: sentNote || null,
          },
        });

        return tx.labOrder.findUnique({
          where: { id: params.id },
          include: {
            invoices: { orderBy: { issuedAt: "asc" } },
            patient: { select: { id: true, fullName: true, phone: true } },
            doctor: { select: { id: true, fullName: true } },
            trips: { orderBy: { order: "asc" } },
          },
        });
      });

      await writeAudit(auth.user.id, "LAB_TRIP_CREATE", `Laboratuvar gidiş adımı eklendi (${params.id})`);
      await bumpRealtimeInstitution(auth.user.institutionId || null);
      return NextResponse.json(updatedOrder, { status: 201 });
    } catch (error: any) {
      // Unique(labOrderId, order) çakışırsa yeniden sıra hesaplayıp tekrar dene.
      if (error?.code === "P2002" && attempt < 4) continue;
      if (error instanceof Error && error.message === "LAB_ORDER_NOT_ACTIVE") {
        return NextResponse.json({ error: "Tamamlanmış veya iptal edilmiş siparişe yeni laboratuvar adımı eklenemez" }, { status: 400 });
      }
      throw error;
    }
  }

  return NextResponse.json({ error: "Gidiş adımı oluşturulamadı, lütfen tekrar deneyin" }, { status: 409 });
}
