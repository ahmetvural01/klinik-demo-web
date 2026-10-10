import { redirect } from "next/navigation";
import { financeFallbackPath, getFinanceAccess } from "@/app/(panel)/muhasebe/_lib/finance-access";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const FORWARDED = ["durum", "q", "yeni", "patientId", "patientName"] as const;

/**
 * /taksit → Muhasebe › Alacaklar › Taksitler (durum, arama ve "yeni plan"
 * parametreleri korunur). Muhasebe ekranını açamayan kullanıcı (ör. doktor,
 * asistan) önceden /yetkisiz'e düşüyordu; artık taksitleri gördüğü yere,
 * hastanın dosyasına (patientId varsa) ya da hasta listesine gider.
 */
export default async function TaksitRedirectPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const value = (key: string) => {
    const raw = params[key];
    return typeof raw === "string" ? raw : "";
  };
  const access = await getFinanceAccess();
  if (access?.has("finance:center")) {
    const query = new URLSearchParams({ tab: "alacaklar", gorunum: "taksitler" });
    for (const key of FORWARDED) if (value(key)) query.set(key, value(key));
    redirect(`/muhasebe?${query.toString()}`);
  }
  const patientId = value("patientId");
  if (patientId && access?.has("patients:read")) redirect(`/hasta-detay?id=${encodeURIComponent(patientId)}&tab=odeme`);
  redirect(financeFallbackPath(access, "hasta"));
}
