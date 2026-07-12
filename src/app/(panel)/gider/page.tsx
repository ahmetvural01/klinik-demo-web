import { redirect } from "next/navigation";

/**
 * /gider → /muhasebe?islem=gider
 * Gider yönetimi artık Muhasebe Merkezi'ndeki tek işlem formundan yönetilmektedir.
 */
export default function GiderRedirectPage() {
  redirect("/muhasebe?islem=gider");
}
