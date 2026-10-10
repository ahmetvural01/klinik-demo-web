"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Toolbar } from "@/components/ui/Toolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { HakedisMonthlyPanel } from "@/components/hakedis/HakedisMonthlyPanel";
import { FinanceDoctorSelect } from "@/components/muhasebe/FinanceDoctorSelect";

type Props = {
  /** Oturumdaki kişi doktor: yalnız kendi dökümü, doktor seçici yok. */
  isDoctor: boolean;
  /** Doktorsa kendi kimliği; değilse adresteki doktor (varsa). */
  initialDoctorId: string;
};

/**
 * Hakedişim ekranı: doktor için sade — ayların hakedişi, ödenen ve kalan;
 * satıra tıklayınca ayın dökümü. Ödeme düğmesi yok (ödeme muhasebeden yapılır).
 * Hakediş görme izni olan ama muhasebe ekranı olmayan diğer kullanıcılar
 * doktor seçerek aynı dökümü görür.
 */
export function HakedisimView({ isDoctor, initialDoctorId }: Props) {
  const { can } = usePermissions();
  const canExportOthers = can("finance:export");
  const [doctorId, setDoctorId] = useState(initialDoctorId);

  return (
    <section className="space-y-3">
      <PageHeader icon="hakediş" title={isDoctor ? "Hakedişim" : "Hakediş"} />
      {!isDoctor && (
        <Toolbar>
          <div className="w-full sm:w-72">
            <FinanceDoctorSelect value={doctorId} onChange={setDoctorId} emptyLabel="Doktor seçin" size="sm" aria-label="Doktor" />
          </div>
        </Toolbar>
      )}
      {doctorId ? (
        // Doktor kendi dökümünü indirebilir; başkasının dökümünü indirmek finans dışa aktarma yetkisidir.
        <HakedisMonthlyPanel doctorId={doctorId} canPay={false} canExport={isDoctor || canExportOthers} />
      ) : (
        <EmptyState title="Doktor seçin" description="Hakediş dökümünü görmek için yukarıdan doktor seçin." compact />
      )}
    </section>
  );
}
