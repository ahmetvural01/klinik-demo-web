import { shortDate, stockLabelCode } from "@/components/stock/stock-shared";

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export type BarcodeLabelItem = {
  id: string;
  name: string;
  barcode?: string | null;
  storageLocation?: string | null;
  /** Etikette yazılacak son kullanma tarihi (parti SKT'si öncelikli). */
  expiry?: string | null;
};

export type BarcodePrintResult = "ok" | "popup-blocked" | "invalid-code" | "load-failed";

/**
 * Ürün için barkod etiketi yazdırır. Barkod kütüphanesi (jsbarcode) yalnız
 * yazdırırken yüklenir; önceden Stok sayfası her açılışta indiriyordu.
 * Pencere tıklamayla AYNI anda açılır (sonra açılırsa tarayıcı açılır
 * pencereyi engeller); kod CODE128'e uymuyorsa pencere hiç açılmaz.
 */
export async function printBarcodeLabel(item: BarcodeLabelItem): Promise<BarcodePrintResult> {
  const code = stockLabelCode(item);
  // CODE128 yalnız ASCII basılabilir karakterleri kodlar (Türkçe harf yok).
  if (!code || !/^[\x20-\x7E]+$/.test(code)) return "invalid-code";
  const printWindow = window.open("", "_blank", "width=420,height=520");
  if (!printWindow) return "popup-blocked";

  let svg: SVGSVGElement;
  try {
    const { default: JsBarcode } = await import("jsbarcode");
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, code, { format: "CODE128", width: 2, height: 56, displayValue: true, fontSize: 13, margin: 8 });
  } catch (error) {
    printWindow.close();
    // Kütüphane yüklenemediyse (bağlantı) kod hatası gibi gösterme.
    return error instanceof Error && /chunk|import|fetch|load/i.test(error.message) ? "load-failed" : "invalid-code";
  }

  const meta = [
    item.storageLocation ? `Raf: ${escapeHtml(item.storageLocation)}` : "",
    item.expiry ? `SKT: ${escapeHtml(shortDate(item.expiry))}` : "",
  ].filter(Boolean).join(" · ");
  printWindow.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8" /><title>${escapeHtml(item.name)}</title>
<style>body{font-family:Arial,sans-serif;margin:24px;color:#111827}.label{border:1px solid #111827;padding:14px;width:320px}.name{font-weight:700;font-size:14px}.meta{font-size:12px;color:#475569;margin-top:4px}svg{width:100%;height:auto;margin-top:8px}@media print{body{margin:8mm}.label{break-inside:avoid}}</style>
</head><body><div class="label"><div class="name">${escapeHtml(item.name)}</div>${meta ? `<div class="meta">${meta}</div>` : ""}${svg.outerHTML}</div>
<script>window.onload=function(){window.print();}<\/script></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  return "ok";
}
