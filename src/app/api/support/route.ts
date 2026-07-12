import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit, withApiTiming } from "@/lib/api";

export const GET = withApiTiming("support", async function GET() {
  const auth = await requireAuth("support:read");
  if (auth.error) return auth.error;

  const tickets = await prisma.supportTicket.findMany({
    where: auth.user.role !== "SUPERADMIN" ? { user: { institutionId: auth.user.institutionId } } : {},
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, fullName: true, role: true, institutionId: true } } },
    take: 500,
  });

  return NextResponse.json(tickets);
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth("support:write");
  if (auth.error) return auth.error;

  const body = await request.json();

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: auth.user.id,
      subject: body.subject || "Genel",
      message: body.message
    }
  });

  await writeAudit(auth.user.id, "SUPPORT_CREATE", "Destek talebi oluşturuldu");
  return NextResponse.json(ticket, { status: 201 });
}
