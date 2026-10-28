// Ana sayfa düzeni — sayfa (page.tsx) ve iskelet (HomeSkeleton) aynı sınıfları
// kullanır; açılışta düzen zıplamaz.
//
// Geniş ekranda (1360 px+) randevular solda, sağ sütun TEK yüzey: Bekleyen işler,
// Duyurular ve Ekip mesajları aynı kartın bölümleri, aralarında ince çizgi
// (önceden üç ayrı kart üst üste duruyordu). Daha dar ekranda sağ sütun kabı
// `contents` olur: bölümler ızgaranın öğeleri olarak kendi kartlarıyla dizilir —
// Bekleyen işler randevuların üstünde, Duyurular ve Ekip mesajları altında.

/** İki sütunlu ızgara (randevuları görebilen rol). */
export const HOME_GRID = "grid gap-4 min-[1360px]:grid-cols-[minmax(0,1fr)_340px] min-[1360px]:items-start";

/** Sol sütun: bugünkü randevular. */
export const HOME_MAIN = "min-w-0 min-[1360px]:col-start-1 min-[1360px]:row-start-1";

/** Sağ sütun kabı: geniş ekranda tek kart, dar ekranda görünmez kap. */
export const HOME_SIDE_PANEL = [
  "contents min-[1360px]:col-start-2 min-[1360px]:row-start-1 min-[1360px]:block min-[1360px]:min-w-0 min-[1360px]:overflow-hidden",
  "min-[1360px]:rounded-[var(--radius-surface)] min-[1360px]:border min-[1360px]:border-[rgb(var(--app-border))]",
  "min-[1360px]:bg-[rgb(var(--app-surface))] min-[1360px]:shadow-[var(--shadow-rest)]",
].join(" ");

/**
 * Sağ sütundaki bölümün kartı (Section) geniş ekranda kabın içinde çerçevesiz
 * kalır; yalnız üst kenarı bölümler arasındaki ayırıcı çizgi olarak durur.
 * `.ui-surface` katmansız CSS olduğu için sıfırlama `!` ile yapılır.
 */
export const HOME_SIDE_SECTION = "min-[1360px]:!rounded-none min-[1360px]:!border-x-0 min-[1360px]:!border-b-0 min-[1360px]:!shadow-none min-[1360px]:first:!border-t-0";

/** Dar ekranda Bekleyen işler randevuların üstünde (DOM'da sağ sütunun içinde). */
export const HOME_TODO_ORDER = "order-first min-[1360px]:order-none";
