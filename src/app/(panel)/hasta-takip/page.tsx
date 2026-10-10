import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Taşınan parametreler: ?yeni=1 ve hasta bağlamı (görev formu, hasta dosyası, eski bağlantılar).
const KEPT_PARAMS = ["yeni", "patientId", "patientName", "not"] as const;

// Eski sekmeler birbirini kapsıyordu (Açık ⊃ Gecikmiş/Bugün); yeni gruplar çakışmasız:
// gecikmiş, bugünkü ve tarihsiz aramaların hepsi "Bugün aranacak"ta.
const STATUS_BY_OLD_TAB: Record<string, string> = {
  acik: "bugun",
  gecikmis: "bugun",
  bugun: "bugun",
  kapali: "kapali",
};

/**
 * Hasta Takip artık Yapılacaklar > "Hasta aramaları" sekmesinde. Eski adres
 * parametreleriyle sunucuda anında yönlenir; eski ?tab= değeri yeni durum
 * süzgecine (?durum=) eşlenir.
 */
export default async function HastaTakipRedirect({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = new URLSearchParams({ tab: "arama" });
  const oldTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const status = oldTab ? STATUS_BY_OLD_TAB[oldTab] : undefined;
  if (status && status !== "bugun") next.set("durum", status);
  for (const key of KEPT_PARAMS) {
    const value = params[key];
    const text = Array.isArray(value) ? value[0] : value;
    if (text) next.set(key, text);
  }
  redirect(`/yapilacaklar?${next.toString()}`);
}
