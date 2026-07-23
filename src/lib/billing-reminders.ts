import { prisma } from "@/lib/prisma";
import { sendEmail, buildInvoiceReminderHtml, buildInvoiceReminderSms } from "@/lib/email";
import { sendSms } from "@/lib/sms";

export type ReminderChannel = "EMAIL" | "SMS";
export type ReminderResult = { channel: ReminderChannel; success: boolean; error?: string };

// Süperadmin panelindeki "Hatırlatma Gönder" butonu ve otomatik zamanlanmış
// tarama (bkz. runDueInvoiceReminderSweep) AYNI bu fonksiyonu çağırır — tek
// bir yerde iki farklı gönderim mantığı olursa (biri e-posta metnini
// güncelleyip diğerini unutmak gibi) zamanla birbirinden sapar.
export async function sendInvoiceReminder(invoiceId: string, channels: ReminderChannel[]): Promise<ReminderResult[]> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { institution: true } });
  if (!invoice) throw new Error("Fatura bulunamadı");
  if (invoice.status === "PAID") throw new Error("Ödenen faturaya hatırlatma gönderilemez");

  const now = new Date();
  const daysLeft = invoice.dueDate ? Math.ceil((invoice.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const isOverdue = Boolean(invoice.dueDate && invoice.dueDate < now);

  const results: ReminderResult[] = [];

  for (const channel of channels) {
    if (channel === "EMAIL") {
      const email = invoice.institution.email;
      if (!email) {
        results.push({ channel: "EMAIL", success: false, error: "Kurumun e-posta adresi yok" });
        await prisma.invoiceReminder.create({ data: { invoiceId, channel: "EMAIL", sentTo: "", status: "FAILED", errorDetail: "E-posta adresi yok" } });
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
      const subject = isOverdue ? `⚠ Gecikmiş Fatura: ${invoice.invoiceNo}` : `💳 Fatura Hatırlatması: ${invoice.invoiceNo}`;

      const result = await sendEmail({ to: email, subject, html });
      results.push({ channel: "EMAIL", success: result.success, error: result.error });
      await prisma.invoiceReminder.create({
        data: { invoiceId, channel: "EMAIL", sentTo: email, status: result.success ? "SENT" : "FAILED", errorDetail: result.error },
      });
    }

    if (channel === "SMS") {
      const phone = invoice.institution.phone;
      if (!phone) {
        results.push({ channel: "SMS", success: false, error: "Kurumun telefon numarası yok" });
        await prisma.invoiceReminder.create({ data: { invoiceId, channel: "SMS", sentTo: "", status: "FAILED", errorDetail: "Telefon numarası yok" } });
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
        data: { invoiceId, channel: "SMS", sentTo: phone, status: result.success ? "SENT" : "FAILED", errorDetail: result.error },
      });
    }
  }

  return results;
}

const APPROACHING_WINDOW_DAYS = 7;
// Aynı faturaya günde birden fazla hatırlatma gitmesin diye — sweep saatte
// bir çalışsa da, bir faturaya en fazla ~20 saatte bir gerçek gönderim yapılır.
const MIN_HOURS_BETWEEN_REMINDERS = 20;

// Süperadmin panelindeki "Hatırlatma Gönder" butonu manuel kalır (ve hem
// e-posta hem SMS seçebilir) — otomatik tarama kasıtlı olarak SADECE e-posta
// kullanır. SMS, platformun kendi bakiyesinden düşen ücretli bir kaynak;
// insan onayı olmadan otomatik/tekrarlayan bir işten SMS harcamak istenmeyen
// bir maliyet sürprizi olur. E-posta ücretsiz ve sınırsız tekrarlanabilir.
export async function runDueInvoiceReminderSweep(): Promise<{ checked: number; sent: number; failed: number; skippedRecent: number }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - MIN_HOURS_BETWEEN_REMINDERS * 60 * 60 * 1000);

  const candidates = await prisma.invoice.findMany({
    where: {
      status: { in: ["PENDING", "OVERDUE"] },
      dueDate: { not: null },
    },
    select: { id: true, dueDate: true },
  });

  let checked = 0;
  let sent = 0;
  let failed = 0;
  let skippedRecent = 0;

  for (const invoice of candidates) {
    const daysLeft = Math.ceil((invoice.dueDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const inWindow = daysLeft <= APPROACHING_WINDOW_DAYS; // yaklaşan (0-7 gün) veya zaten gecikmiş (negatif)
    if (!inWindow) continue;

    checked += 1;

    const lastReminder = await prisma.invoiceReminder.findFirst({
      where: { invoiceId: invoice.id, channel: "EMAIL" },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    });
    if (lastReminder && lastReminder.sentAt > cutoff) {
      skippedRecent += 1;
      continue;
    }

    try {
      const results = await sendInvoiceReminder(invoice.id, ["EMAIL"]);
      if (results.some((r) => r.success)) sent += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      console.error("[billing-reminder-sweep] invoice", invoice.id, error);
    }
  }

  return { checked, sent, failed, skippedRecent };
}
