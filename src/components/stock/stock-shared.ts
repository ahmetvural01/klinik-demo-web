import { turkeyDateKey } from "@/lib/tz";

/**
 * Stok, satın alma ve fiyat ekranlarının ortak seçenekleri ve yardımcıları.
 * Önceden her ekran kategori/birim listesini ve aramayı ayrı yazıyordu:
 * stok kartında seçilen birim satın alma satırında serbest metin oluyor,
 * "İmplant" araması "implant" kaydını bulmuyordu.
 */
export const STOCK_CATEGORIES = ["Anestezi", "İmplant", "Protez", "Dolgu", "Ortodonti", "Cerrahi", "Sarf", "Diğer"] as const;
export const STOCK_UNITS = ["adet", "kutu", "paket", "şişe", "ampul", "set", "ml", "gr"] as const;

/** SKT bu kadar gün içindeyse "yaklaşıyor" sayılır. */
export const EXPIRY_WARNING_DAYS = 90;

/**
 * Listede olmayan mevcut değeri (ör. eski kayıttaki "MEDIKAL" kategorisi ya da
 * satın almada yazılmış "Kutu" birimi) seçenek listesine ekler. Aksi halde
 * açılır liste ilk seçeneği gösterir ve kaydedince değer sessizce değişir.
 */
export function optionsWithCurrent(options: readonly string[], ...current: Array<string | null | undefined>): string[] {
  const result = [...options];
  for (const raw of current) {
    const value = (raw || "").trim();
    if (!value) continue;
    if (!result.some((option) => searchKey(option) === searchKey(value))) result.push(value);
  }
  return result;
}

/**
 * Türkçe büyük/küçük harf ve aksan farkını yok sayan arama anahtarı:
 * "İmplant", "IMPLANT" ve "implant" aynı anahtara iner; "şişe" "sise" ile bulunur.
 */
export function searchKey(value: string | null | undefined): string {
  return (value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sorgu boşsa ya da alanlardan biri sorguyu içeriyorsa true. */
export function matchesSearch(query: string, ...fields: Array<string | null | undefined>): boolean {
  const q = searchKey(query);
  if (!q) return true;
  return fields.some((field) => searchKey(field).includes(q));
}

export type ExpiryState = "expired" | "soon" | "ok";

/**
 * Son kullanma durumu gün bazında (Türkiye takvimi) hesaplanır: bugün biten
 * ürün "geçti" değil "yaklaşıyor" sayılır.
 */
export function expiryState(value: string | null | undefined, now: Date = new Date()): ExpiryState | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  const today = turkeyDateKey(now);
  if (day < today) return "expired";
  const limit = turkeyDateKey(new Date(now.getTime() + EXPIRY_WARNING_DAYS * 86_400_000));
  return day <= limit ? "soon" : "ok";
}

/** Kısa tarih: 09.10.2026 */
export function shortDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("tr-TR");
}

/** Bugünün tarih anahtarı (YYYY-MM-DD, Türkiye). */
export function todayKey(): string {
  return turkeyDateKey();
}

/** Tekrar gönderimde aynı işlemin ikinci kez yazılmaması için istek anahtarı. */
export function newRequestKey(prefix = "req"): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type StockLastPurchase = {
  date?: string | null;
  supplier?: string | null;
  supplierId?: string | null;
  unitPrice?: number | null;
  quantity?: number | null;
  invoiceNo?: string | null;
};

/** /api/stock listesinin döndürdüğü ürün (stok kartı). */
export type StockItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  barcode?: string | null;
  expiresAt?: string | null;
  storageLocation?: string | null;
  isActive?: boolean;
  averageUnitPrice?: number | null;
  activeLotCount?: number;
  /** Aktif partilerdeki en yakın son kullanma tarihi. */
  nearestExpiry?: string | null;
  /** Aktif partilerde kalan toplam miktar (çıkış yalnız partiden yapılabilir). */
  lotQuantity?: number | null;
  /** Teslim alınmamış siparişlerdeki miktar. */
  onOrderQuantity?: number;
  lastPurchase?: StockLastPurchase | null;
};

/** Ürünün izlenecek son kullanma tarihi: parti SKT'si ile karttaki tarihin en yakını. */
export function itemExpiry(item: Pick<StockItem, "expiresAt" | "nearestExpiry">): string | null {
  const dates = [item.nearestExpiry, item.expiresAt].filter((value): value is string => Boolean(value));
  if (dates.length === 0) return null;
  return dates.sort((a, b) => a.slice(0, 10).localeCompare(b.slice(0, 10)))[0];
}

export function isLowStock(item: Pick<StockItem, "quantity" | "minQuantity">): boolean {
  return Number(item.quantity) < Number(item.minQuantity);
}

/**
 * Çıkış yalnız parti (lot) kaydı olan miktardan yapılabilir. Parti sistemi
 * gelmeden önce açılmış kartlarda kart miktarı partilerden fazladır; bu
 * fark kullanıcıya önceden söylenir (yoksa çıkış teknik bir hatayla reddedilir).
 */
export function lotGap(item: Pick<StockItem, "quantity" | "lotQuantity">): number {
  if (typeof item.lotQuantity !== "number") return 0;
  return Math.max(0, Number(item.quantity) - item.lotQuantity);
}

export function maxStockOut(item: Pick<StockItem, "quantity" | "lotQuantity">): number {
  const quantity = Math.max(0, Number(item.quantity));
  return typeof item.lotQuantity === "number" ? Math.min(quantity, Math.max(0, item.lotQuantity)) : quantity;
}

/** Sunucunun teknik stok hatalarını kullanıcının anlayacağı cümleye çevirir. */
export function friendlyStockError(message: string | null | undefined, fallback: string): string {
  const text = (message || "").trim();
  if (!text) return fallback;
  if (text.includes("kullanılabilir parti bulunamadı") || text.includes("partileri ile kart bakiyesi")) {
    return "Bu ürünün bir kısmının parti (lot) kaydı yok; o miktardan çıkış yapılamıyor. Durumu sistem yöneticinize bildirin.";
  }
  if (text.includes("Expected integer")) return "Miktar tam sayı olmalı (ör. 1, 2, 3).";
  return text;
}

export type StockStatusKey = "expired" | "critical" | "onorder" | "soon" | "ok";

export const STOCK_STATUS_META: Record<StockStatusKey, { label: string; tone: "critical" | "warning" | "info" | "success" | "neutral" }> = {
  expired: { label: "SKT geçti", tone: "critical" },
  critical: { label: "Kritik", tone: "critical" },
  onorder: { label: "Az · siparişte", tone: "info" },
  soon: { label: "SKT yakın", tone: "warning" },
  ok: { label: "Yeterli", tone: "neutral" },
};

/**
 * Satırın tek durumu (en acil olan). "Kritik" yalnız minimumun altında olup
 * siparişi verilmemiş üründür; siparişi verilmiş olan "Az · siparişte" olarak
 * ayrılır ki aynı ürün ikinci kez sipariş edilmesin.
 */
export function stockStatus(item: Pick<StockItem, "quantity" | "minQuantity" | "onOrderQuantity" | "expiresAt" | "nearestExpiry">, now: Date = new Date()): StockStatusKey {
  const expiry = expiryState(itemExpiry(item), now);
  if (expiry === "expired") return "expired";
  if (isLowStock(item)) return (item.onOrderQuantity || 0) > 0 ? "onorder" : "critical";
  if (expiry === "soon") return "soon";
  return "ok";
}

/** Sipariş önerisi: minimumun iki katına tamamlayacak miktar (en az 1). */
export function suggestedOrderQuantity(item: Pick<StockItem, "quantity" | "minQuantity" | "onOrderQuantity">): number {
  const target = Math.max(1, Number(item.minQuantity) * 2);
  return Math.max(1, Math.ceil(target - Number(item.quantity) - Number(item.onOrderQuantity || 0)));
}

/** "12 adet" */
export function formatQuantity(quantity: number | null | undefined, unit?: string | null): string {
  const value = Number(quantity || 0).toLocaleString("tr-TR");
  return unit ? `${value} ${unit}` : value;
}
