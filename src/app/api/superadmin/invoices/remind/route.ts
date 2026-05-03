import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildInvoiceReminderHtml, buildInvoiceReminderSms } from "@/lib/email";
import { sendSms } from "@/lib/sms";

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json();
  const { invoiceId, channels } = body as { invoiceId: string; channels: string[] };

  if (!invoiceId || !channels || !Array.isArray(channels) || channels.length === 0) {
    return NextResponse.json({ message: "invoiceId ve channels zorunlu" }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { institution: true },
  });

  if (!invoice) return NextResponse.json({ message: "Fatura bulunamadı" }, { status: 404 });
  if (invoice.status === "PAID") return NextResponse.json({ message: "Ödenen faturaya hatırlatma gönderilemez" }, { status: 400 });

  const now = new Date();
  const daysLeft = invoice.dueDate
    ? Math.ceil((invoice.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const isOverdue = Boolean(invoice.dueDate && invoice.dueDate < now);

  const results: Array<{ channel: string; success: boolean; error?: string }> = [];

  for (const channel of channels) {
    if (channel === "EMAIL") {
      const email = invoice.institution.email;
      if (!email) {
        results.push({ channel: "EMAIL", success: false, error: "Kurumun e-posta adresi yok" });
        await prisma.invoiceReminder.create({
          data: { invoiceId, channel: "EMAIL", sentTo: "", status: "FAILED", errorDetail: "E-posta adresi yok" },
        });
        continue;
      }

      const html = buildInvoiceReminderHtml({
        institutionName: invoice.institution.name,
        invoiceNo: invoice.invoiceNo,
        amount: Number(invoice.amount),
        dueDate: invoice.dueDate?.toISOString() ?? null,
        daysLeft,
        isOverdue,
      });

      const subject = isOverdue
        ? `⚠ Gecikmiş Fatura: ${invoice.invoiceNo}`
        : `💳 Fatura Hatırlatması: ${invoice.invoiceNo}`;

      const result = await sendEmail({ to: email, subject, html });
      results.push({ channel: "EMAIL", success: result.success, error: result.error });
      await prisma.invoiceReminder.create({
        data: {
          invoiceId,
          channel: "EMAIL",
          sentTo: email,
          status: result.success ? "SENT" : "FAILED",
          errorDetail: result.error,
        },
      });
    }

    if (channel === "SMS") {
      const phone = invoice.institution.phone;
      if (!phone) {
        results.push({ channel: "SMS", success: false, error: "Kurumun telefon numarası yok" });
        await prisma.invoiceReminder.create({
          data: { invoiceId, channel: "SMS", sentTo: "", status: "FAILED", errorDetail: "Telefon numarası yok" },
        });
        continue;
      }

      const message = buildInvoiceReminderSms({
        institutionName: invoice.institution.name,
        invoiceNo: invoice.invoiceNo,
        amount: Number(invoice.amount),
        dueDate: invoice.dueDate?.toISOString() ?? null,
        daysLeft,
        isOverdue,
      });

      const result = await sendSms(phone, message);
      results.push({ channel: "SMS", success: result.success, error: result.error });
      await prisma.invoiceReminder.create({
        data: {
          invoiceId,
          channel: "SMS",
          sentTo: phone,
          status: result.success ? "SENT" : "FAILED",
          errorDetail: result.error,
        },
      });
    }
  }

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
