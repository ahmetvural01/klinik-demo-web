/**
 * Klinik paneli reklamları (tek sağlayıcı: Google AdSense) — saf kurallar.
 * Sunucu (Süperadmin › Reklamlar API'si, /ads.txt) ve tarayıcı (reklam alanı,
 * src/components/layout/AdSlot.tsx) aynı fonksiyonları kullanır.
 * Test: npx tsx scripts/panel-ads-rules-test.ts
 */

/** Panel kabuğunun reklam alanına verdiği ayar (sunucuda okunur, istemciye prop olarak gider). */
export type PanelAdSettings = {
  /** Platform geneli anahtar (Süperadmin › Reklamlar › "Reklamlar açık"). */
  enabled: boolean;
  /** "ca-pub-" + 16 hane. */
  publisherId: string;
  /** AdSense reklam birimi kimliği (yalnız rakam). */
  slotId: string;
  /** Kliniğin anahtarı (Institution.adsEnabled). */
  clinicAdsEnabled: boolean;
  /** Süperadmin'in kliniğe gizli girişi: kendi reklamına gösterim/tıklama yazılmasın. */
  ghost: boolean;
};

export type PanelAdContext = PanelAdSettings & {
  pathname: string;
  /** Adresin sorgu kısmı ("tab=…", başında "?" olabilir). */
  search?: string;
  /** document.referrer — reklam isteğiyle Google'a gider. */
  referrer?: string;
};

/**
 * Reklam gösterilmeyen ekranlar: hasta dosyası ve sağlık kayıtları (hasta
 * dosyasının sekmeleri, reçete, tedavi planı, muayene) ile "yetkiniz yok"
 * ekranı (AdSense içeriksiz ekranda reklam istemez).
 */
export const AD_FREE_PATH_PREFIXES = ["/hasta-detay", "/recete", "/tedavi-plani", "/muayene", "/yetkisiz"] as const;

/**
 * Reklam isteği sayfanın adresini (sorgusu dahil) ve önceki sayfayı Google'a
 * gönderir. Panel adreslerinde hasta adı, araması ya da kimliği bulunabilir
 * (?patientName=, ?q=, ?id=); bunlar Google'a gitmemeli (KVKK ve AdSense'in
 * kişisel veri kuralı). Yalnız aşağıdaki gezinme/süzgeç parametreleri varken
 * reklam gösterilir; başka herhangi bir parametre o görünümde reklamı kapatır.
 */
const SAFE_QUERY_KEYS = new Set([
  "tab", "donem", "from", "to", "date", "yeni", "durum", "tur", "gorunum",
  "kapsam", "view", "sirala", "sayfa", "boyut", "kanal", "talepler", "neden",
]);

const PUBLISHER_ID = /^ca-pub-\d{16}$/;
const SLOT_ID = /^\d{8,12}$/;

/**
 * Yayıncı kimliğini "ca-pub-1234567890123456" biçimine getirir. "pub-…",
 * yalnız 16 hane ya da AdSense'ten kopyalanmış kodun tamamı da kabul edilir.
 * Geçersizse null.
 */
export function normalizePublisherId(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  const match = /(?:^|[^a-z0-9-])(?:ca-)?pub-(\d{16})(?!\d)/.exec(` ${value}`) ?? /^(\d{16})$/.exec(value);
  return match ? `ca-pub-${match[1]}` : null;
}

/** Reklam birimi kimliği (yalnız rakam). Kopyalanan kodda data-ad-slot="…" de kabul edilir. Geçersizse null. */
export function normalizeAdSlotId(raw: string): string | null {
  const value = raw.trim();
  const fromCode = /data-ad-slot\s*=\s*["']?(\d+)/i.exec(value)?.[1];
  const digits = fromCode ?? value;
  return SLOT_ID.test(digits) ? digits : null;
}

export function isValidPublisherId(value: string): boolean {
  return PUBLISHER_ID.test(value);
}

export function isValidAdSlotId(value: string): boolean {
  return SLOT_ID.test(value);
}

/** /ads.txt satırı (Google'ın sabit sertifika kimliğiyle). */
export function adsTxtLine(publisherId: string): string {
  return `google.com, ${publisherId.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0`;
}

export function adsenseScriptSrc(publisherId: string): string {
  return `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisherId)}`;
}

export function isAdFreePath(pathname: string): boolean {
  return AD_FREE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Sorgu yalnız güvenli parametrelerden mi oluşuyor. Giriş ekranından dönüşteki
 * `next` (ör. /klinik/giris?next=/randevu?…) içindeki adres de aynı kurala tabidir.
 */
export function isAdSafeQuery(search: string, nested = false): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const [key, value] of params) {
    if (SAFE_QUERY_KEYS.has(key)) continue;
    if (key === "next" && !nested) {
      const queryStart = value.indexOf("?");
      if (queryStart === -1 || isAdSafeQuery(value.slice(queryStart + 1), true)) continue;
    }
    return false;
  }
  return true;
}

function isAdSafeReferrer(referrer: string): boolean {
  if (!referrer) return true;
  try {
    return isAdSafeQuery(new URL(referrer).search);
  } catch {
    return false;
  }
}

/**
 * Reklam alanı görünsün mü — TEK kural. Reklamlar platformda açık, iki kimlik
 * girilmiş, klinikte açık, oturum süperadmin'in gizli girişi değil, ekran
 * sağlık ekranı değil ve adreste (ya da önceki sayfada) kişisel veri taşıyabilecek
 * parametre yok.
 */
export function shouldShowPanelAd(context: PanelAdContext): boolean {
  return (
    context.enabled &&
    isValidPublisherId(context.publisherId) &&
    isValidAdSlotId(context.slotId) &&
    context.clinicAdsEnabled &&
    !context.ghost &&
    !isAdFreePath(context.pathname) &&
    isAdSafeQuery(context.search ?? "") &&
    isAdSafeReferrer(context.referrer ?? "")
  );
}
