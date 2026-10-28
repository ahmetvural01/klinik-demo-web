"use client";

// Bütün çıktıların (tedavi raporu, teklif, tahsilat dökümü, ödeme planı,
// makbuz, onam, reçete, randevu listesi) TEK antedi: solda logo, klinik adı
// ve iletişim satırı; sağda belge adı ve tarih; altta ince kurum çizgisi.
// Altbilgi kliniğin adı ve iletişimini tekrar eder. Önceden her belge kendi
// antedini çiziyordu (lacivert bant, siyah çizgi, ızgara) ve logo hiç yoktu.

import { cachedGet } from "@/lib/client-cache";
import { formatPhoneNumber } from "@/lib/format";

export type PrintClinic = {
  name: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  taxNo: string;
  registryNo: string;
  /** https adresi ya da yüklenmiş logo (data URL); yoksa boş. */
  logoUrl: string;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Antet bilgisi (/api/documents/letterhead, 5 dk bellekte). Okunamazsa boş künye. */
export async function loadPrintClinic(): Promise<PrintClinic> {
  const body = await cachedGet<Record<string, unknown> | null>("/api/documents/letterhead", 5 * 60_000).catch(() => null);
  return {
    name: text(body?.institutionName),
    phone: text(body?.institutionPhone),
    email: text(body?.institutionEmail),
    address: text(body?.institutionAddress),
    website: text(body?.institutionWebsite),
    taxNo: text(body?.institutionTaxNo),
    registryNo: text(body?.institutionRegistryNo),
    logoUrl: text(body?.logoUrl),
  };
}

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeLogo(url: string) {
  return /^https:\/\//i.test(url) || /^data:image\/(png|jpe?g|webp|svg\+xml|gif);base64,/i.test(url) ? url : "";
}

/** Telefon her yerde aynı biçimde: "(0530) 637-5370" (yalnız rakamdan oluşan Türkiye numarası). */
function displayPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return /^0?\d{10}$/.test(digits) ? formatPhoneNumber(digits) : phone;
}

export function clinicContactLine(clinic: PrintClinic) {
  return [clinic.address, clinic.phone ? `Tel: ${displayPhone(clinic.phone)}` : "", clinic.website || clinic.email].filter(Boolean).join(" · ");
}

/** Antet: logo + klinik adı + iletişim; sağda belge adı, tarih ve (varsa) belge no. */
export function letterheadHtml(clinic: PrintClinic, options: { title: string; date?: string; meta?: string[] }) {
  const logo = safeLogo(clinic.logoUrl);
  const contact = clinicContactLine(clinic);
  const meta = [options.date, ...(options.meta || [])].filter(Boolean) as string[];
  return `<header class="ks-lh">
    <div class="ks-lh-clinic">
      ${logo ? `<img class="ks-lh-logo" src="${escapeHtml(logo)}" alt="" />` : ""}
      <div>
        <div class="ks-lh-name">${escapeHtml(clinic.name || "Klinik")}</div>
        ${contact ? `<div class="ks-lh-contact">${escapeHtml(contact)}</div>` : ""}
      </div>
    </div>
    <div class="ks-lh-doc">
      <div class="ks-lh-title">${escapeHtml(options.title)}</div>
      ${meta.map((line) => `<div class="ks-lh-meta">${escapeHtml(line)}</div>`).join("")}
    </div>
  </header>`;
}

/** Altbilgi: klinik künyesi (vergi/sicil no varsa) — her belgede aynı. */
export function letterheadFooterHtml(clinic: PrintClinic, note?: string) {
  const legal = [clinic.taxNo ? `Vergi no: ${clinic.taxNo}` : "", clinic.registryNo ? `Sicil no: ${clinic.registryNo}` : ""].filter(Boolean).join(" · ");
  const line = [clinic.name, clinicContactLine(clinic), legal].filter(Boolean).join(" · ");
  return `<footer class="ks-lf">${note ? `<div class="ks-lf-note">${escapeHtml(note)}</div>` : ""}<div>${escapeHtml(line)}</div></footer>`;
}

/** Antet ve altbilginin stili (ekranda önizleme ve baskıda aynı). */
export const LETTERHEAD_CSS = `
  .ks-lh { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 8px; margin-bottom: 10px; border-bottom: 2px solid #1e3a5f; }
  .ks-lh-clinic { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .ks-lh-logo { max-height: 46px; max-width: 120px; object-fit: contain; }
  .ks-lh-name { font-size: 15px; font-weight: 700; color: #0f172a; line-height: 1.2; }
  .ks-lh-contact { margin-top: 2px; font-size: 9px; color: #475569; }
  .ks-lh-doc { text-align: right; flex-shrink: 0; }
  .ks-lh-title { font-size: 12px; font-weight: 800; letter-spacing: 1px; color: #1e3a5f; text-transform: uppercase; }
  .ks-lh-meta { font-size: 9px; color: #475569; margin-top: 1px; }
  .ks-lf { margin-top: 12px; padding-top: 5px; border-top: 1px solid #cbd5e1; font-size: 8px; color: #64748b; text-align: center; }
  .ks-lf-note { margin-bottom: 2px; color: #475569; }
`;

/**
 * Belgeyi gizli bir çerçevede yazdırır (açılır pencere engeline takılmaz,
 * panel sayfası değişmez). `bodyHtml` antet dahil belge içeriğidir.
 */
export function printDocument(title: string, bodyHtml: string, extraCss = "") {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1e293b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    ${LETTERHEAD_CSS}
    ${extraCss}
  </style></head><body>${bodyHtml}</body></html>`);
  doc.close();
  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1500);
  };
  // Logo yüklensin diye resimler bitince yazdırılır (en çok 1,5 sn beklenir).
  const images = Array.from(doc.images);
  if (images.length === 0) {
    window.setTimeout(run, 50);
    return;
  }
  let done = false;
  const finish = () => { if (!done) { done = true; run(); } };
  let left = images.length;
  images.forEach((image) => {
    if (image.complete) { left -= 1; return; }
    image.addEventListener("load", () => { left -= 1; if (left <= 0) finish(); });
    image.addEventListener("error", () => { left -= 1; if (left <= 0) finish(); });
  });
  if (left <= 0) window.setTimeout(finish, 50);
  window.setTimeout(finish, 1500);
}
