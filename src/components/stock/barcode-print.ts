import JsBarcode from "jsbarcode";
import { shortDate } from "@/components/stock/stock-shared";

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

/**
 * Ürün için barkod etiketi yazdırır. Önceki sürüm pencereyi "noopener" ile
 * açtığı için tarayıcı pencere nesnesini null döndürüyor ve etiket hiç
 * yazılmıyordu; randevu çıktısındaki çalışan desen kullanılır.
 * Sonuç: "ok" | "popup-blocked" | "invalid-code"
 */
export function printBarcodeLabel(item: BarcodeLabelItem): "ok" | "popup-blocked" | "invalid-code" {
  const code = (item.barcode || item.id.slice(-10).toUpperCase()).trim();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, code, { format: "CODE128", width: 2, height: 56, displayValue: true, fontSize: 13, margin: 8 });
  } catch {
    return "invalid-code";
  }
  const printWindow = window.open("", "_blank", "width=420,height=520");
  if (!printWindow) return "popup-blocked";
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
