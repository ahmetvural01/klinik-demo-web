import { StatusPage } from "@/components/ui/StatusPage";
import { Button } from "@/components/ui/Button";

// Klinik paneliyle aynı "yetkisiz" ekranı (ortak StatusPage).
export default function YetkiYokPage() {
  return (
    <StatusPage
      kind="forbidden"
      title="Bu bölüme erişiminiz yok"
      description="Erişim için başka bir platform yöneticisiyle görüşün."
      actions={<Button variant="secondary" href="/superadmin/panel">Kontrol Paneli&apos;ne dön</Button>}
    />
  );
}
