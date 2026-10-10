import { ROUTE_TITLES } from "@/lib/nav";

// Sayfa adlarının tek listesi src/lib/nav.ts'tedir: sol menü adı = sayfa
// başlığı (h1) = tarayıcı sekmesi başlığı. Bu dosya eski içe aktarmalar
// (yetkisiz sayfası, üst bar) için aynı tabloyu dışa açar.
export const PAGE_TITLES: Record<string, string> = ROUTE_TITLES;

export function pageTitleFor(pathname: string | null | undefined): string {
  return (pathname && PAGE_TITLES[pathname]) || "";
}
