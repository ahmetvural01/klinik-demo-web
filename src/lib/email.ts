import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

export type EmailSendResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

export async function getSmtpTransporter() {
  const config = await prisma.smtpConfig.findUnique({ where: { id: 1 } });

  if (!config || !config.isActive || !config.host || !config.username || !config.password) {
    return null;
  }

  return {
    transporter: nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.username,
        pass: config.password,
      },
    }),
    from: `"${config.fromName}" <${config.fromEmail}>`,
  };
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<EmailSendResult> {
  try {
    const transport = await getSmtpTransporter();
    if (!transport) {
      return { success: false, error: "SMTP yapılandırması eksik veya aktif değil" };
    }

    const info = await transport.transporter.sendMail({
      from: transport.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });

    return { success: true, messageId: info.messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export function buildInvoiceReminderHtml(params: {
  institutionName: string;
  invoiceNo: string;
  amount: number;
  dueDate: string | null;
  daysLeft: number;
  isOverdue: boolean;
}): string {
  const { institutionName, invoiceNo, amount, dueDate, daysLeft, isOverdue } = params;

  const statusText = isOverdue
    ? `<span style="color:#dc2626">⚠ ${Math.abs(daysLeft)} gün gecikmiş</span>`
    : `<span style="color:#d97706">⏱ ${daysLeft} gün kaldı</span>`;

  const dueDateText = dueDate ? new Date(dueDate).toLocaleDateString("tr-TR") : "—";

  return `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; background: #f8fafc; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 24px; color: white;">
      <h1 style="margin: 0; font-size: 22px;">💳 Fatura Hatırlatması</h1>
      <p style="margin: 8px 0 0; opacity: 0.85; font-size: 14px;">Klinik Yönetim Paneli</p>
    </div>
    <div style="padding: 28px;">
      <p style="font-size: 16px; color: #374151;">Sayın <strong>${institutionName}</strong>,</p>
      <p style="color: #6b7280; line-height: 1.6;">Aşağıdaki faturanıza ilişkin ödeme bilgisi bulunmaktadır.</p>

      <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Fatura No</td>
            <td style="padding: 8px 0; font-weight: bold; text-align: right;">${invoiceNo}</td>
          </tr>
          <tr style="border-top: 1px solid #e2e8f0;">
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Toplam Tutar</td>
            <td style="padding: 8px 0; font-weight: bold; text-align: right; font-size: 18px;">₺${Number(amount).toLocaleString("tr-TR")}</td>
          </tr>
          <tr style="border-top: 1px solid #e2e8f0;">
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Son Ödeme Tarihi</td>
            <td style="padding: 8px 0; font-weight: bold; text-align: right;">${dueDateText}</td>
          </tr>
          <tr style="border-top: 1px solid #e2e8f0;">
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Durum</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">${statusText}</td>
          </tr>
        </table>
      </div>

      <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
        Lütfen yukarıda belirtilen son ödeme tarihine kadar ödemenizi gerçekleştirin.
        Herhangi bir sorun için destek ekibimizle iletişime geçebilirsiniz.
      </p>

      <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #9ca3af; font-size: 12px;">
        Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayınız.
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function buildInvoiceReminderSms(params: {
  institutionName: string;
  invoiceNo: string;
  amount: number;
  dueDate: string | null;
  daysLeft: number;
  isOverdue: boolean;
}): string {
  const { invoiceNo, amount, daysLeft, isOverdue } = params;
  const amountStr = `₺${Number(amount).toLocaleString("tr-TR")}`;

  if (isOverdue) {
    return `Klinik Yönetim Paneli: ${invoiceNo} no'lu faturanız (${amountStr}) ${Math.abs(daysLeft)} gün gecikti. Lütfen en kısa sürede ödeme yapınız.`;
  }
  return `Klinik Yönetim Paneli: ${invoiceNo} no'lu faturanizin (${amountStr}) son odeme tarihi ${daysLeft} gun icinde dolmaktadir.`;
}
