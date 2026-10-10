import { redirect } from "next/navigation";
import { financeFallbackPath, getFinanceAccess } from "@/app/(panel)/muhasebe/_lib/finance-access";

/**
 * /gider → Muhasebe'de "Gider / ödeme" penceresi (yazma izni yoksa pencere
 * açılmaz, liste görünür). Muhasebe ekranını açamayan kullanıcı kendi günlük
 * ekranına gider.
 */
export default async function GiderRedirectPage() {
  const access = await getFinanceAccess();
  if (access?.has("finance:center")) redirect("/muhasebe?islem=gider");
  redirect(financeFallbackPath(access));
}
