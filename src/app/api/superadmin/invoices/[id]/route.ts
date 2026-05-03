import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const body = await request.json();

  const invoice = await prisma.invoice.update({
    where: { id: params.id },
    data: {
      status: body.status,
      paidAt: body.status === "PAID" ? new Date() : null,
    },
  });

  return NextResponse.json(invoice);
}
