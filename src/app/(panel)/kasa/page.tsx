import { redirect } from "next/navigation";
import { financeFallbackPath, getFinanceAccess } from "@/app/(panel)/muhasebe/_lib/finance-access";

/**
 * /kasa → bugünün tahsilat ve giderleri (Muhasebe › Gelir ve gider, "Bugün").
 * Muhasebe ekranını açamayan kullanıcı (ör. doktor, asistan) önceden
 * /muhasebe üzerinden /yetkisiz'e düşüyordu; artık kendi günlük ekranına gider.
 */
export default async function KasaRedirectPage() {
  const access = await getFinanceAccess();
  if (access?.has("finance:center")) redirect("/muhasebe?tab=defter&donem=bugun");
  redirect(financeFallbackPath(access));
}
