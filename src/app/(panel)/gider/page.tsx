import { redirect } from "next/navigation";

/**
 * /gider → /muhasebe?tab=gider
 * Gider yönetimi artık Muhasebe Merkezi > Gider sekmesinde yönetilmektedir.
 */
export default function GiderRedirectPage() {
  redirect("/muhasebe?tab=gider");
}
