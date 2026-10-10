"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { usePermissions } from "@/components/auth/PermissionProvider";

export type BillingStatus = {
  nextDueDate: string | null;
  daysUntilDue: number | null;
  isRestricted: boolean;
  restrictedNote: string | null;
};

const APPROACHING_WARNING_DAYS = 7;

function formatDueDate(iso: string) {
  // Sunucu ve tarayıcıda aynı çıksın diye Türkiye takvimiyle sabit biçim (#418).
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const turkey = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const day = String(turkey.getUTCDate()).padStart(2, "0");
  const month = String(turkey.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${turkey.getUTCFullYear()}`;
}

/**
 * Ödeme durumu bandı. Durum sayfa açılırken sunucuda hesaplanır
 * (`initialStatus`); önceden ayrı bir istekle sonradan geliyor ve tüm sayfayı
 * aşağı itiyordu. `initialStatus` verilmezse eski yoldan yüklenir.
 * - Kısıtlama başladıysa (kayıt yapılamıyor) herkes görür, kapatılamaz.
 * - Yaklaşan ödeme yalnız ödemeyle ilgilenebilecek rollere (yönetici, muhasebe).
 */
export function BillingStatusBanner({ initialStatus }: { initialStatus?: BillingStatus | null }) {
  const { can } = usePermissions();
  // Yalnız yönetici ve muhasebe: banko da `finance:center` sahibi ama ödemeyle
  // ilgili bir şey yapamaz; bant telefonda her sayfada ~130 px yer kaplıyordu.
  const canActOnBilling = can("settings:write") || can("finance:read");
  const [fetched, setFetched] = useState<BillingStatus | null>(null);
  const status = initialStatus !== undefined ? initialStatus : fetched;

  useEffect(() => {
    if (initialStatus !== undefined) return;
    let cancelled = false;
    fetch("/api/billing-status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: BillingStatus | null) => { if (!cancelled) setFetched(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [initialStatus]);

  if (!status) return null;

  if (status.isRestricted) {
    return (
      <Callout tone="critical" icon={Lock} className="mt-3" title="Ödeme süresi doldu">
        Yeni kayıt, düzenleme ve silme kapalı; kayıtlarınızı görüntüleyebilirsiniz.
        {status.restrictedNote ? ` ${status.restrictedNote}` : ""}
      </Callout>
    );
  }

  if (canActOnBilling && status.daysUntilDue !== null && status.daysUntilDue <= APPROACHING_WARNING_DAYS) {
    const dueLabel = status.nextDueDate ? formatDueDate(status.nextDueDate) : "";
    const timing = status.daysUntilDue < 0
      ? `Ödeme tarihi ${Math.abs(status.daysUntilDue)} gün önce geçti`
      : status.daysUntilDue === 0
        ? "Ödeme süreniz bugün doluyor"
        : `Ödeme süreniz ${status.daysUntilDue} gün içinde doluyor`;
    return (
      <Callout
        tone="warning"
        className="mt-3"
        title={`${timing}${dueLabel ? ` (son tarih ${dueLabel})` : ""}.`}
        action={can("support:write") ? <Button size="sm" variant="secondary" href="/destek?yeni=1">Destek&apos;e yaz</Button> : undefined}
      />
    );
  }

  return null;
}
