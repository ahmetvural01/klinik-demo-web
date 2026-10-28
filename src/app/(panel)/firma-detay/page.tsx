import { redirect } from "next/navigation";

/**
 * Eski tedarikçi sayfası adresi. Tedarikçi ayrıntısı artık Satın alma
 * listesinin üstünde pencere olarak açılır (tek kaydın ayrıntısı pencere;
 * kapatınca liste olduğu yerde kalır). Eski bağlantı ve yer imleri aynı
 * tedarikçiyi ve sekmeyi açar.
 */
export default async function FirmaDetayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const target = new URLSearchParams();
  if (typeof params.id === "string" && params.id) target.set("firma", params.id);
  if (typeof params.tab === "string" && params.tab) target.set("firmaTab", params.tab);
  redirect(target.toString() ? `/firma?${target.toString()}` : "/firma");
}
