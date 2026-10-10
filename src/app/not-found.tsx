import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { StatusPage } from "@/components/ui/StatusPage";
import { decodeTokenUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sayfa bulunamadı" };

/**
 * Kök 404. Önceden herkesi /anasayfa'ya gönderiyordu: oturumsuz ziyaretçi ve
 * SMS bağlantısından gelen hasta personel girişine düşüyordu. Oturum varsa
 * kendi başlangıç sayfasına, yoksa tanıtım sayfasına döner.
 */
export default async function NotFound() {
  const user = await decodeTokenUser().catch(() => null);
  const home = user?.institutionId ? "/anasayfa" : user?.role === "SUPERADMIN" ? "/superadmin/panel" : "/";
  return <StatusPage kind="not-found" fullScreen code="404" actions={<Button href={home}>Ana sayfa</Button>} />;
}
