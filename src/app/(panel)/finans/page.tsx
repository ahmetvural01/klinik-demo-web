"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { HakedisMonthlyPanel } from "@/components/hakedis/HakedisMonthlyPanel";
import { FinanceDoctorSelect } from "@/components/muhasebe/FinanceDoctorSelect";
import { cachedGet } from "@/lib/client-cache";

type CurrentUser = { id?: string; role?: string; fullName?: string };

/**
 * "Hakedişim": doktorun kendi aylık hakediş dökümü. Muhasebe > Hakediş ile aynı
 * hesap (HakedisMonthlyPanel → /api/hakedis) kullanılır.
 *
 * Muhasebe yetkisi olan kullanıcı aynı bilgiyi ödeme düğmeleriyle birlikte
 * Muhasebe > Hakediş'te görür; bu adres onu oraya yönlendirir (aynı bilgi iki
 * ayrı ekranda iki farklı doktor listesiyle görünmesin).
 */
export default function FinansPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const hasFinanceCenter = can("finance:center") && can("finance:read");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState(searchParams.get("doctorId") || "");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!hasFinanceCenter) return;
    const doctorId = searchParams.get("doctorId");
    router.replace(`/muhasebe?tab=hakedis${doctorId ? `&doctorId=${encodeURIComponent(doctorId)}` : ""}`);
  }, [hasFinanceCenter, router, searchParams]);

  useEffect(() => {
    if (hasFinanceCenter) return;
    let active = true;
    setLoading(true);
    setLoadError("");
    cachedGet<CurrentUser>("/api/auth/me", 60_000, { throwOnError: true, force: reloadKey > 0 })
      .then((user) => {
        if (!active) return;
        setCurrentUser(user || null);
        if (user?.role === "DOKTOR" && user.id) setSelectedDoctorId(user.id);
      })
      .catch((error) => {
        if (!active) return;
        setCurrentUser(null);
        setLoadError(error instanceof Error ? error.message : "Hakediş bilgileri yüklenemedi.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [hasFinanceCenter, reloadKey]);

  if (hasFinanceCenter) {
    return (
      <div className="space-y-3">
        <PageHeader icon="hakediş" title="Hakediş" description="Muhasebe > Hakediş ekranına yönlendiriliyorsunuz…" />
      </div>
    );
  }

  const isDoctorView = currentUser?.role === "DOKTOR";

  return (
    <section className="space-y-3" aria-busy={loading}>
      <PageHeader
        icon="hakediş"
        title="Hakedişim"
        description="Her ayın tedavilerinden doktor payı, size yapılan ödemeler ve kalan tutar. Ay kapanınca ödenir."
      />

      {loadError ? (
        <LoadErrorState message={loadError} onRetry={() => setReloadKey((value) => value + 1)} />
      ) : loading ? (
        <p className="py-12 text-center text-sm text-slate-500">Hakediş bilgileri yükleniyor…</p>
      ) : (
        <>
          {!isDoctorView && (
            <div className="max-w-sm">
              <FormField label="Doktor" htmlFor="finans-doctor">
                <FinanceDoctorSelect id="finans-doctor" value={selectedDoctorId} onChange={setSelectedDoctorId} emptyLabel="Doktor seçin" aria-label="Doktor" />
              </FormField>
            </div>
          )}
          {selectedDoctorId ? (
            <HakedisMonthlyPanel doctorId={selectedDoctorId} canPay={false} />
          ) : (
            <EmptyState title="Doktor seçin" description="Hakediş dökümünü görmek için yukarıdan doktor seçin." compact />
          )}
        </>
      )}
    </section>
  );
}
