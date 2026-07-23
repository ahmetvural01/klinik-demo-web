import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sendInvoiceReminder, type ReminderChannel } from "@/lib/billing-reminders";

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json();
  const { invoiceId, channels } = body as { invoiceId: string; channels: string[] };

  if (!invoiceId || !channels || !Array.isArray(channels) || channels.length === 0) {
    return NextResponse.json({ message: "invoiceId ve channels zorunlu" }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { institution: true } });
  if (!invoice) return NextResponse.json({ message: "Fatura bulunamadı" }, { status: 404 });

  let results;
  try {
    results = await sendInvoiceReminder(invoiceId, channels as ReminderChannel[]);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Hatırlatma gönderilemedi" }, { status: 400 });
  }

  await writeAudit(
    auth.user.id,
    "SUPERADMIN_INVOICE_REMINDER_SEND",
    `${invoice.institution.name} / ${invoice.invoiceNo} için hatırlatma: ${channels.join(", ")} (${results.filter((r) => r.success).length}/${results.length} başarılı)`,
  );
  return NextResponse.json({ results });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const invoiceId = searchParams.get("invoiceId");

  if (!invoiceId) return NextResponse.json({ message: "invoiceId zorunlu" }, { status: 400 });

  const reminders = await prisma.invoiceReminder.findMany({
    where: { invoiceId },
    orderBy: { sentAt: "desc" },
  });

  return NextResponse.json(reminders);
}
