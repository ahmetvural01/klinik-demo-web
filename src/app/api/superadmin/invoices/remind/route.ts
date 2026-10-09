import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sendInvoiceReminder, type ReminderChannel } from "@/lib/billing-reminders";

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json().catch(() => null) as { invoiceId?: unknown; channels?: unknown } | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek gövdesi." }, { status: 400 });
  }
  const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId.trim() : "";
  const rawChannels = Array.isArray(body.channels) ? body.channels : [];

  if (!invoiceId || rawChannels.length === 0) {
    return NextResponse.json({ message: "Fatura ve en az bir gönderim kanalı seçilmelidir." }, { status: 400 });
  }
  if (rawChannels.some((channel) => channel !== "EMAIL" && channel !== "SMS")) {
    return NextResponse.json({ message: "Geçersiz gönderim kanalı seçildi." }, { status: 400 });
  }
  const channels = [...new Set(rawChannels)] as ReminderChannel[];

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { institution: true } });
  if (!invoice) return NextResponse.json({ message: "Fatura bulunamadı" }, { status: 404 });
  if (invoice.status === "PAID") {
    return NextResponse.json({ message: "Ödenmiş faturaya hatırlatma gönderilemez." }, { status: 409 });
  }
  if (invoice.status === "CANCELLED") {
    return NextResponse.json({ message: "İptal edilmiş faturaya hatırlatma gönderilemez." }, { status: 409 });
  }

  let results;
  try {
    results = await sendInvoiceReminder(invoiceId, channels);
  } catch (error) {
    console.error("[superadmin invoice reminder POST]", error);
    return NextResponse.json({ message: "Hatırlatma gönderilemedi. Lütfen tekrar deneyin." }, { status: 503 });
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
