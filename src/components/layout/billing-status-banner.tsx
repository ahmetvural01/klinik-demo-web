"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Lock } from "lucide-react";

type BillingStatus = {
  nextDueDate: string | null;
  daysUntilDue: number | null;
  isRestricted: boolean;
  restrictedNote: string | null;
};

const APPROACHING_WARNING_DAYS = 7;

export function BillingStatusBanner() {
  const [status, setStatus] = useState<BillingStatus | null>(null);

  useEffect(() => {
    fetch("/api/billing-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: BillingStatus | null) => setStatus(d))
      .catch(() => {});
  }, []);

  if (!status) return null;

  if (status.isRestricted) {
    return (
      <div className="flex items-start gap-2.5 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-bold">Ödeme süresi doldu.</span> Yeni kayıt oluşturma, düzenleme ve silme geçici olarak kapalı — mevcut kayıtlarınızı görüntülemeye devam edebilirsiniz.
          {status.restrictedNote ? ` ${status.restrictedNote}` : " Devam etmek için lütfen ödemenizi tamamlayın veya bizimle iletişime geçin."}
        </p>
      </div>
    );
  }

  if (status.daysUntilDue !== null && status.daysUntilDue <= APPROACHING_WARNING_DAYS) {
    const dueLabel = status.nextDueDate ? new Date(status.nextDueDate).toLocaleDateString("tr-TR") : "";
    return (
      <div className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-bold">
            {status.daysUntilDue === 0 ? "Ödeme süreniz bugün doluyor." : `Ödeme süreniz ${status.daysUntilDue} gün içinde doluyor`}
          </span>
          {dueLabel ? ` (${dueLabel}).` : "."} Kesintisiz kullanım için lütfen ödemenizi zamanında tamamlayın.
        </p>
      </div>
    );
  }

  return null;
}
