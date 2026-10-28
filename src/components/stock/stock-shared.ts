import { turkeyDateKey } from "@/lib/tz";

/**
 * Stok, satın alma ve fiyat ekranlarının ortak seçenekleri ve yardımcıları.
 * Önceden her ekran kategori/birim listesini ve aramayı ayrı yazıyordu:
 * stok kartında seçilen birim satın alma satırında serbest metin oluyor,
 * "İmplant" araması "implant" kaydını bulmuyordu.
 */
export const STOCK_CATEGORIES = ["Anestezi", "İmplant", "Protez", "Dolgu", "Ortodonti", "Cerrahi", "Sarf", "Diğer"] as const;
export const STOCK_UNITS = ["adet", "kutu", "paket", "şişe", "ampul", "set", "ml", "gr"] as const;

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

/** Eski kayıtlarda kalan, bugünkü listede karşılığı olmayan kategori kodları (arama anahtarıyla). */
const LEGACY_CATEGORY_LABELS: Record<string, (typeof STOCK_CATEGORIES)[number]> = {
  medikal: "Sarf",
};

/**
 * Kategorinin ekranda ve süzgeçte görünen etiketi: eski büyük harfli kodlar
 * ("SARF", "IMPLANT", "MEDIKAL") bugünkü etikete eşlenir; kayıt değişmez.
 * Önceden süzgeçte "MEDIKAL" ve "Sarf" yan yana ayrı seçenekti.
 */
export function stockCategoryLabel(value: string | null | undefined): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  const key = searchKey(raw);
  return STOCK_CATEGORIES.find((option) => searchKey(option) === key) || LEGACY_CATEGORY_LABELS[key] || raw;
}

/** Sorgu boşsa ya da alanlardan biri sorguyu içeriyorsa true. */
export function matchesSearch(query: string, ...fields: Array<string | null | undefined>): boolean {
  const q = searchKey(query);
  if (!q) return true;
  return fields.some((field) => searchKey(field).includes(q));
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
  storageLocation?: string | null;
  isActive?: boolean;
  averageUnitPrice?: number | null;
  /** Teslim alınmamış siparişlerdeki miktar. */
  onOrderQuantity?: number;
  lastPurchase?: StockLastPurchase | null;
};

export function isLowStock(item: Pick<StockItem, "quantity" | "minQuantity">): boolean {
  return Number(item.quantity) < Number(item.minQuantity);
}

/**
 * KRİTİK STOK — TEK KURAL (stok listesi, ürün detayı, menü rozeti ve ana
 * sayfa aynı fonksiyonu kullanmalı): miktar minimumun ALTINDA ve siparişi
 * verilmemiş. Minimumu 0 olan ürün hiç kritik olmaz ("uyarı istemiyorsanız
 * 0 yazın"). Önceden menü "≤" ve siparişteki ürünleri de sayıyor, Stok
 * sayfası "<" sayıyordu; aynı anda 2 ve 1 görünüyordu.
 */
export function isCriticalStock(item: Pick<StockItem, "quantity" | "minQuantity" | "onOrderQuantity">): boolean {
  return isLowStock(item) && !((item.onOrderQuantity || 0) > 0);
}

export function countCriticalStock(items: ReadonlyArray<Pick<StockItem, "quantity" | "minQuantity" | "onOrderQuantity">>): number {
  return items.reduce((count, item) => count + (isCriticalStock(item) ? 1 : 0), 0);
}

export type StockBadge = { key: "critical" | "onorder"; label: string; tone: "critical" | "info" };

/**
 * Satırın stok durumu rozeti (en çok bir): siparişi verilmişse "Siparişte N",
 * değilse minimumun altındaki ürün "Kritik". Yeterli stokta rozet yoktur.
 */
export function stockBadges(item: Pick<StockItem, "quantity" | "minQuantity" | "onOrderQuantity" | "unit">): StockBadge[] {
  const onOrder = Number(item.onOrderQuantity || 0);
  if (onOrder > 0) return [{ key: "onorder", label: `Siparişte ${formatQuantity(onOrder, item.unit)}`, tone: "info" }];
  if (isLowStock(item)) return [{ key: "critical", label: "Kritik", tone: "critical" }];
  return [];
}

/**
 * Etikete basılan kod: barkod yoksa sistem kodu (kart kimliğinin son 10
 * hanesi). Arama da bu kodu bulur — önceden basılan etiket okutulunca
 * "ürün yok" çıkıyordu.
 */
export function stockLabelCode(item: Pick<StockItem, "id" | "barcode">): string {
  return (item.barcode || item.id.slice(-10).toUpperCase()).trim();
}

/** Sunucunun teknik stok hatalarını kullanıcının anlayacağı cümleye çevirir. */
export function friendlyStockError(message: string | null | undefined, fallback: string): string {
  const text = (message || "").trim();
  if (!text) return fallback;
  if (text.includes("Expected integer")) return "Miktar tam sayı olmalı (ör. 1, 2, 3).";
  return text;
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
