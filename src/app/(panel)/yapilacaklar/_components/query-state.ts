// Aramalar ve görevler sayfasının adres parametreleri (sekme, durum, kapsam). Yerel
// geçmiş API'si kullanılır: Next (14.1+) bunu useSearchParams ile eşitler,
// sunucuya tur atılmaz ve seçim anında değişir (bkz. ui/Tabs useTabParam).

export function replaceQuery(updates: Record<string, string | null | undefined>) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "") params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

export const PAGE_TABS = ["arama", "gorev"] as const;
export type PageTab = (typeof PAGE_TABS)[number];

export const FOLLOW_STATUS_KEYS = ["bugun", "sonraki", "kapali"] as const;
export type FollowStatus = (typeof FOLLOW_STATUS_KEYS)[number];

// "zamani-gelen": bana atanmış, açık ya da beklemedeki ve hatırlatma (yoksa son
// tarih) zamanı gelmiş görevler — menü rozeti ve zildeki sayıyla aynı kural.
export const TASK_VIEW_KEYS = ["yapilacak", "zamani-gelen", "tamamlanan", "iptal"] as const;
export type TaskView = (typeof TASK_VIEW_KEYS)[number];

export const isFollowStatus = (value: string | null): value is FollowStatus =>
  Boolean(value) && (FOLLOW_STATUS_KEYS as readonly string[]).includes(value as string);

export const isTaskView = (value: string | null): value is TaskView =>
  Boolean(value) && (TASK_VIEW_KEYS as readonly string[]).includes(value as string);
