import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeInstitution, requireAuth, writeAudit } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { LAB_ORDER_INCLUDE, closeOpenLabFollowUps, toPublicLabOrder } from "@/app/api/lab-orders/lab-order-api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAuth("lab:write");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ error: branch.message }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  const { description, sentAt, sentNote, expectedAt } = body;

  if (typeof description !== "string" || !description.trim() || description.length > 180) return NextResponse.json({ error: "Gönderilen iş bilgisi zorunludur." }, { status: 400 });
  if (sentNote !== undefined && sentNote !== null && (typeof sentNote !== "string" || sentNote.length > 1000)) {
    return NextResponse.json({ error: "Gönderim notu geçersiz" }, { status: 400 });
  }
  if (sentAt !== undefined && sentAt !== null && (typeof sentAt !== "string" || Number.isNaN(new Date(sentAt).getTime()))) {
    return NextResponse.json({ error: "Gönderim tarihi geçersiz" }, { status: 400 });
  }
  // Beklenen dönüş: bu tarih geçince iş "Gecikiyor" görünür (önceden her iş
  // türü için sabit 4 gün sayılıyordu; şemadaki alan hiç kullanılmıyordu).
  if (expectedAt !== undefined && expectedAt !== null && expectedAt !== "" && (typeof expectedAt !== "string" || Number.isNaN(new Date(expectedAt).getTime()))) {
    return NextResponse.json({ error: "Beklenen dönüş tarihi geçersiz" }, { status: 400 });
  }
  const sentDate = sentAt ? new Date(sentAt) : new Date();
  const expectedDate = typeof expectedAt === "string" && expectedAt ? new Date(expectedAt) : null;
  if (expectedDate && expectedDate.getTime() < new Date(sentDate.toISOString().slice(0, 10)).getTime()) {
    return NextResponse.json({ error: "Beklenen dönüş tarihi gönderimden önce olamaz" }, { status: 400 });
  }

  const order = await (prisma as any).labOrder.findFirst({
    where: {
      id: params.id,
      ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}),
      branchId: branch.branchId,
    },
    select: { id: true, status: true },
  });
  if (!order) return NextResponse.json({ error: "Laboratuvar işi bulunamadı" }, { status: 404 });
  if (order.status !== "DEVAM_EDIYOR") {
    return NextResponse.json({ error: "Hastaya takılmış veya iptal edilmiş işe yeni gönderim eklenemez" }, { status: 400 });
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
        // Aynı işte iki açık gönderim olmasın (önceki hiç "geldi" işaretlenmeden
        // kalıyordu); çift tıklama da ikinci gönderimi açamaz.
        const pending = await tx.labTrip.count({ where: { labOrderId: params.id, receivedAt: null } });
        if (pending > 0) throw new Error("LAB_TRIP_PENDING");
        const last = await tx.labTrip.findFirst({
          where: { labOrderId: params.id },
          orderBy: { order: "desc" },
          select: { order: true },
        });
        const nextOrder = (last?.order ?? 0) + 1;

        await tx.labTrip.create({
          data: {
            institutionId: auth.user.institutionId!,
            branchId: branch.branchId,
            labOrderId: params.id,
            order: nextOrder,
            description: description.trim(),
            sentAt: sentDate,
            expectedAt: expectedDate,
            sentNote: sentNote || null,
          },
        });

        // Prova yapıldı ve iş laboratuvara geri gitti: "hastayı prova için ara" kaydı kapanır.
        await closeOpenLabFollowUps(tx, params.id, "Prova yapıldı; iş laboratuvara yeniden gönderildi.");

        return tx.labOrder.findUnique({ where: { id: params.id }, include: LAB_ORDER_INCLUDE });
      });

      await writeAudit(auth.user.id, "LAB_TRIP_CREATE", `Laboratuvar gidiş adımı eklendi (${params.id})`);
      await bumpRealtimeInstitution(auth.user.institutionId || null);
      return NextResponse.json(await toPublicLabOrder(updatedOrder, auth.user.role), { status: 201 });
    } catch (error: any) {
      // Unique(labOrderId, order) çakışırsa yeniden sıra hesaplayıp tekrar dene.
      if (error?.code === "P2002" && attempt < 4) continue;
      if (error instanceof Error && error.message === "LAB_TRIP_PENDING") {
        return NextResponse.json({ error: "Bu iş zaten laboratuvarda. Önce “Laboratuvardan geldi” kaydedin." }, { status: 409 });
      }
      if (error instanceof Error && error.message === "LAB_ORDER_NOT_ACTIVE") {
        return NextResponse.json({ error: "Hastaya takılmış veya iptal edilmiş işe yeni gönderim eklenemez" }, { status: 400 });
      }
      throw error;
    }
  }

  return NextResponse.json({ error: "Gidiş adımı oluşturulamadı, lütfen tekrar deneyin" }, { status: 409 });
}
