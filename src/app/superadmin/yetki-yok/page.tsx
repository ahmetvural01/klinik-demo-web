import { ShieldOff } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export default function YetkiYokPage() {
  return (
    <section className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={ShieldOff}
        title="Bu bölüme erişiminiz yok"
        description="Erişim için başka bir platform yöneticisiyle görüşün."
        action={<Button variant="secondary" href="/superadmin/panel">Kontrol Paneli&apos;ne dön</Button>}
      />
    </section>
  );
}
