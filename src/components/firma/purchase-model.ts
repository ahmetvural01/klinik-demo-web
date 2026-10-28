import type { BadgeTone } from "@/components/ui/Badge";
import { toMoneyValue } from "@/lib/money-input";
import { newRequestKey, type StockItem } from "@/components/stock/stock-shared";

export type { StockItem };

export type PurchaseItemRow = {
  id: string; stockItemId: string; productName: string;
  quantity: number; unit: string; unitPrice: number | string; lineTotal: number | string;
  /** Bu satırla gelen üründen kullanıldı mı (kullanıldıysa ürün/miktar/fiyat değiştirilemez, satın alma iptal edilemez). */
  consumed?: boolean;
};

export type PurchaseLineSummary = { productName: string; quantity: number; unit: string; stockItemId?: string };

export type Purchase = {
  id: string; firmaId: string; firmaIslemId?: string | null; tarih: string;
  receiptStatus: "SIPARIS_VERILDI" | "TESLIM_ALINDI"; receivedAt?: string | null;
  total?: number;
  aciklama?: string | null; status: string;
  firma?: { id: string; name: string };
  firmaIslem?: { tutar: number; dueDate?: string | null } | null;
  paymentSummary?: {
    total: number;
    paidTotal: number;
    remaining: number;
    status: "ODENMEDI" | "KISMI" | "ODENDI";
    payments: { id: string; tarih: string; tutar: number; yontem?: string | null }[];
  };
  _count?: { items: number };
  items?: PurchaseItemRow[];
  /** Liste uç noktasının döndürdüğü kısa kalem özeti. */
  lines?: PurchaseLineSummary[];
};

export type PurchaseLineForm = {
  key: string; id?: string; stockItemId: string; productQuery: string;
  category: string; unit: string; quantity: string;
  /** Normalize tutar metni ("120.50") ya da "" — MoneyInput değeri. */
  unitPrice: string;
  /** Düzenlemede: bu satırla gelen üründen kullanılmışsa satır kilitlidir. */
  locked?: boolean;
};

export type LineErrors = Record<string, { product?: string; quantity?: string; unitPrice?: string }>;

export type PurchaseFirmaOption = {
  id: string; name: string; bakiye?: number;
  /** Teslim alınmamış sipariş sayısı (yeni alımda "önce siparişi teslim al" uyarısı için). */
  bekleyenSiparis?: number;
};

export type PurchasePrefill = {
  receiptStatus?: Purchase["receiptStatus"];
  lines?: Partial<PurchaseLineForm>[];
  /** Firma listesi henüz yüklenmediyse arama kutusunda görünecek ad. */
  firmaName?: string | null;
};

export const RECEIPT_STATUS_META: Record<Purchase["receiptStatus"], { label: string; tone: BadgeTone }> = {
  SIPARIS_VERILDI: { label: "Teslimat bekliyor", tone: "warning" },
  TESLIM_ALINDI: { label: "Teslim alındı", tone: "success" },
};

export const PAYMENT_STATUS_META: Record<NonNullable<Purchase["paymentSummary"]>["status"], { label: string; tone: BadgeTone }> = {
  ODENMEDI: { label: "Ödenmedi", tone: "neutral" },
  KISMI: { label: "Kısmen ödendi", tone: "warning" },
  ODENDI: { label: "Ödendi", tone: "success" },
};

export const newLineKey = () => newRequestKey("line");

export const emptyLine = (patch: Partial<PurchaseLineForm> = {}): PurchaseLineForm => ({
  key: newLineKey(),
  stockItemId: "",
  productQuery: "",
  category: "Sarf",
  unit: "adet",
  quantity: "",
  unitPrice: "",
  ...patch,
});

/** Satır boş mu (hiçbir şey yazılmamış). */
export const isBlankLine = (line: PurchaseLineForm) => !line.stockItemId && !line.productQuery.trim() && !line.quantity.trim() && !line.unitPrice.trim();

/**
 * Tutarlar kuruş (tam sayı) olarak toplanır; JS ondalık sayısıyla toplamada
 * "2.750,0000001" gibi kaymalar olmasın ve ödeme ≤ toplam karşılaştırması
 * kuruşu kuruşuna yapılsın.
 */
export function moneyToCents(value: string | number | null | undefined): bigint {
  const normalized = toMoneyValue(value ?? null);
  return normalized ? BigInt(normalized.replace(".", "")) : BigInt(0);
}

export function centsToMoney(cents: bigint): string {
  const negative = cents < BigInt(0);
  const digits = (negative ? -cents : cents).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export function lineTotalCents(line: Pick<PurchaseLineForm, "quantity" | "unitPrice">): bigint {
  const quantity = /^\d+$/.test(line.quantity.trim()) ? BigInt(line.quantity.trim()) : BigInt(0);
  return moneyToCents(line.unitPrice) * quantity;
}

export function purchaseTotalCents(items: PurchaseLineForm[]): bigint {
  return items.reduce((sum, line) => sum + lineTotalCents(line), BigInt(0));
}

/** Gösterim için (formatCurrency number ister); hesap kuruşta yapılır. */
export const centsToNumber = (cents: bigint) => Number(cents) / 100;

/** "Anestezi kartuşu ×10, Eldiven ×2 +1 kalem" */
export function summarizeLines(lines: PurchaseLineSummary[] | undefined, max = 2): string {
  if (!lines || lines.length === 0) return "";
  const head = lines.slice(0, max).map((line) => `${line.productName} ×${line.quantity}`).join(", ");
  return lines.length > max ? `${head} +${lines.length - max} kalem` : head;
}

/** Sunucunun teknik satın alma hatalarını kullanıcının anlayacağı cümleye çevirir. */
export function friendlyPurchaseError(message: string | null | undefined, fallback: string): string {
  const text = (message || "").trim();
  if (!text) return fallback;
  if (text.includes("gelen üründen kullanılmış") || text.includes("ters stok hareketi") || text.includes("partisinden stok çıkışı")) {
    const product = /^([^:]+): Bu satın alma(?:yla gelen üründen| partisinden)/.exec(text)?.[1];
    return `${product ? `${product} kullanıldığı için` : "Ürünlerin bir kısmı kullanıldığı için"} bu satırın ürünü, miktarı ve fiyatı değiştirilemez; satın alma da iptal edilemez. Kullanılmayan ürünleri firmaya iade ettiyseniz satın almayı “Düzenle” ile açıp o satırları silin ya da miktarını azaltın.`;
  }
  if (text.includes("firma ödemelerinden mahsup")) {
    return "Bu satın alma firma ödemeleriyle kapatılmış. İptal etmek için önce firma sayfasındaki ilgili ödemeyi iptal edin.";
  }
  if (text.includes("Expected integer")) return "Miktarlar tam sayı olmalı (ör. 1, 2, 3).";
  return text;
}

export function validateLines(items: PurchaseLineForm[]): LineErrors {
  const errors: LineErrors = {};
  items.forEach((line) => {
    if (line.locked) return;
    const lineError: LineErrors[string] = {};
    if (!line.stockItemId && !line.productQuery.trim()) lineError.product = "Ürün seçin veya yeni ürün adı yazın.";
    if (!/^\d+$/.test(line.quantity.trim()) || Number(line.quantity) <= 0) lineError.quantity = "Miktarı tam sayı girin.";
    if (line.unitPrice.trim() === "" || toMoneyValue(line.unitPrice) === null || line.unitPrice.trim().startsWith("-")) lineError.unitPrice = "Birim fiyatı girin.";
    if (lineError.product || lineError.quantity || lineError.unitPrice) errors[line.key] = lineError;
  });
  return errors;
}

export function lineErrorSummary(items: PurchaseLineForm[], errors: LineErrors): string | null {
  const rows = items.map((line, index) => (errors[line.key] ? index + 1 : 0)).filter(Boolean);
  if (rows.length === 0) return null;
  return `Ürün satırlarını tamamlayın: ${rows.map((row) => `${row}. satır`).join(", ")}.`;
}

/**
 * Satırları API gövdesine çevirir (oluşturma ve düzenleme aynı biçim). Lot no
 * ve son kullanma gönderilmez: düzeltmede sunucu satırdaki eski değeri korur.
 */
export function linesToPayload(items: PurchaseLineForm[]) {
  return items.map((line) => ({
    ...(line.id !== undefined ? { id: line.id || null } : {}),
    stockItemId: line.stockItemId || null,
    newProductName: line.stockItemId ? null : line.productQuery.trim(),
    category: line.category,
    unit: line.unit,
    quantity: Number(line.quantity),
    unitPrice: toMoneyValue(line.unitPrice) ?? "0.00",
  }));
}
