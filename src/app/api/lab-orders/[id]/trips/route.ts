import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeInstitution, requireAuth, writeAudit } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("appointments:write");
  if (auth.error) return auth.error;

  const body = await req.json();
  const { description, sentAt, sentNote } = body;

  if (!description) return NextResponse.json({ error: "description zorunlu" }, { status: 400 });

  const order = await (prisma as any).labOrder.findFirst({
    where: {
      id: params.id,
      ...(auth.user.role !== "SUPERADMIN" ? { patient: { institutionId: auth.user.institutionId } } : {}),
    },
    select: { id: true },
  });
  if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const updatedOrder = await (prisma as any).$transaction(async (tx: any) => {
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
            description,
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
      throw error;
    }
  }

  return NextResponse.json({ error: "Gidiş adımı oluşturulamadı, lütfen tekrar deneyin" }, { status: 409 });
}
