import { redirect } from "next/navigation";

/**
 * /gider → Muhasebe'de "Gider ekle" penceresi.
 */
export default function GiderRedirectPage() {
  redirect("/muhasebe?islem=gider");
}
