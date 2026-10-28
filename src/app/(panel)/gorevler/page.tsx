import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Taşınan parametreler: ?yeni=1 (üst bar "Yeni > Görev"), hasta bağlamı ve kapsam (bildirim zili).
const KEPT_PARAMS = ["yeni", "patientId", "patientName", "kapsam", "sorumlu"] as const;

/**
 * Görevler artık Aramalar ve görevler > "Ekip görevleri" sekmesinde. Eski adres (yer
 * imleri, menü ve zil bağlantıları) parametreleriyle sunucuda anında yönlenir.
 */
export default async function GorevlerRedirect({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = new URLSearchParams({ tab: "gorev" });
  for (const key of KEPT_PARAMS) {
    const value = params[key];
    const text = Array.isArray(value) ? value[0] : value;
    if (text) next.set(key, text);
  }
  redirect(`/yapilacaklar?${next.toString()}`);
}
