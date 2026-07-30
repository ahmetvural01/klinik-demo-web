import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit, withApiTiming } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";

export const GET = withApiTiming("support", async function GET() {
  const auth = await requireAuth("support:read");
  if (auth.error) return auth.error;

  const tickets = await prisma.supportTicket.findMany({
    where: auth.user.role !== "SUPERADMIN" ? { institutionId: auth.user.institutionId } : {},
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, fullName: true, role: true, institutionId: true } } },
    take: 500,
  });

  return NextResponse.json(tickets);
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth("support:write");
  if (auth.error) return auth.error;

  // Önceden hiçbir sınır yoktu — herhangi bir kullanıcı sınırsız destek
  // talebi açıp süperadmin konsolunu spam/gürültüyle doldurabilirdi (bkz.
  // denetim raporu).
  const rate = checkRateLimit(`support-create:${auth.user.id}`, 5, 10 * 60_000);
  if (!rate.ok) {
    return NextResponse.json({ message: "Çok fazla destek talebi oluşturdunuz. Lütfen biraz sonra tekrar deneyin." }, { status: 429 });
  }

  const body = await request.json();
  const subject = String(body.subject || "Genel").trim().slice(0, 120);
  const message = String(body.message || "").trim();
  if (!message) return NextResponse.json({ message: "Mesaj zorunlu" }, { status: 400 });

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: auth.user.id,
      institutionId: auth.user.institutionId,
      subject: subject || "Genel",
      message
    }
  });

  await writeAudit(auth.user.id, "SUPPORT_CREATE", `Destek talebi oluşturuldu: ${subject || "Genel"}`);
  return NextResponse.json(ticket, { status: 201 });
}
