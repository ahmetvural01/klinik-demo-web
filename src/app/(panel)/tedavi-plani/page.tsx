import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Ayrı tedavi planı sayfası kaldırıldı: tedavi planı artık hasta dosyasının
 * Tedavi sekmesindeki "Planlanan tedaviler" listesidir (teklif oradan
 * yazdırılır). Eski adres (yer imleri, eski bağlantılar) hastası belliyse o
 * hastanın Tedavi sekmesine, değilse Hastalar listesine sunucuda anında yönlenir.
 */
export default async function TedaviPlaniRedirect({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const raw = params.patientId;
  const patientId = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!patientId) redirect("/hasta");
  redirect(`/hasta-detay?${new URLSearchParams({ id: patientId, tab: "tedavi" }).toString()}`);
}
