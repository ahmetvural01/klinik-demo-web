import { redirect } from "next/navigation";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Eski adres: personel ekleme/düzenleme artık Personel sayfasında pencere
 * olarak açılır (dönünce listedeki arama ve süzgeçler kaybolmuyor). Yer
 * imleri ve eski bağlantılar çalışmaya devam etsin diye yönlendirir:
 * /personel-ekle → /personel?yeni=1, /personel-ekle?id=X → /personel?id=X.
 */
export default async function PersonelEklePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const id = typeof params.id === "string" ? params.id.trim() : "";
  redirect(id ? `/personel?id=${encodeURIComponent(id)}` : "/personel?yeni=1");
}
