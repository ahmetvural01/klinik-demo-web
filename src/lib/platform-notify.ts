/* eslint-disable no-console -- Bildirim hataları sunucu tanılaması için bilinçli olarak loglanır. */
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}

/**
 * Platform sahibine (aktif süperadminlerin e-postasına) kısa bildirim:
 * yeni destek talebi, kliniğin SMS paketi alması gibi elle ilgilenilmesi
 * gereken olaylar. Süperadmin › E-posta (SMTP) kapalıysa sessizce atlanır.
 * Klinik tarafının yanıtını bekletmemek için `notifyPlatformOwnersLater` kullanın.
 */
export async function notifyPlatformOwners(subject: string, lines: string[], link?: { path: string; label: string }) {
  const admins = await prisma.user.findMany({
    where: { role: "SUPERADMIN", isActive: true, email: { not: null } },
    select: { email: true },
  });
  const recipients = [...new Set(admins.map((admin) => admin.email?.trim()).filter((email): email is string => Boolean(email)))];
  if (recipients.length === 0) return;

  const base = (process.env.APP_URL || "").replace(/\/$/, "");
  const href = link && base ? `${base}${link.path}` : null;
  const html = [
    `<p>${lines.map(escapeHtml).join("<br>")}</p>`,
    href ? `<p><a href="${escapeHtml(href)}">${escapeHtml(link!.label)}</a></p>` : "",
  ].join("");
  const text = [...lines, href ? `${link!.label}: ${href}` : ""].filter(Boolean).join("\n");

  const results = await Promise.all(recipients.map((to) => sendEmail({ to, subject: `CepKlinik: ${subject}`, html, text })));
  const failed = results.filter((result) => !result.success);
  if (failed.length > 0 && failed.length === results.length && failed[0].error !== "SMTP yapılandırması eksik veya aktif değil") {
    console.error("[platform-notify] Bildirim e-postası gönderilemedi:", failed[0].error);
  }
}

export function notifyPlatformOwnersLater(...args: Parameters<typeof notifyPlatformOwners>) {
  void notifyPlatformOwners(...args).catch((error) => console.error("[platform-notify] Bildirim hatası:", error));
}
