import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const body = await req.json();
  const { description, sentAt, sentNote } = body;

  if (!description) return NextResponse.json({ error: "description zorunlu" }, { status: 400 });

  // Determine next order number
  const last = await (prisma as any).labTrip.findFirst({
    where:   { labOrderId: params.id },
    orderBy: { order: "desc" },
    select:  { order: true },
  });
  const nextOrder = (last?.order ?? 0) + 1;

  const trip = await (prisma as any).labTrip.create({
    data: {
      labOrderId: params.id,
      order:      nextOrder,
      description,
      sentAt:     sentAt     ? new Date(sentAt)     : new Date(),
      sentNote:   sentNote   || null,
    },
  });

  return NextResponse.json(trip, { status: 201 });
}
