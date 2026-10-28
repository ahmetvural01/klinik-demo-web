"use client";

import { useEffect, useState } from "react";
import { FormModal } from "@/components/ui/FormModal";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/Input";
import { showToastSafe } from "@/lib/toast-client";
import { errorMessage, saGet, saSend } from "./sa-fetch";

/**
 * Faturalar › "Ödeme bilgisi": kliniklerin Ayarlar › Abonelik'te gördüğü
 * IBAN/alıcı adı. Önceden klinik faturayı nasıl ödeyeceğini hiçbir yerde
 * göremiyordu.
 */
export function PaymentInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    saGet<{ paymentInstructions: string }>("/api/superadmin/billing-config", "Ödeme bilgisi yüklenemedi.")
      .then((data) => { if (!cancelled) setValue(data.paymentInstructions || ""); })
      .catch((failure) => { if (!cancelled) setError(errorMessage(failure, "Ödeme bilgisi yüklenemedi.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saSend("/api/superadmin/billing-config", "PUT", { paymentInstructions: value }, "Ödeme bilgisi kaydedilemedi.");
      showToastSafe({ type: "success", message: "Ödeme bilgisi kaydedildi." });
      onClose();
    } catch (failure) {
      setError(errorMessage(failure, "Ödeme bilgisi kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Ödeme bilgisi"
      description="Klinikler bunu Ayarlar › Abonelik'te faturalarının yanında görür."
      size="md"
      onSubmit={() => void save()}
      submitting={saving}
      submitDisabled={loading}
      error={error}
    >
      <FormField label="Nasıl ödenir" htmlFor="payment-info" hint="Ör. alıcı adı, banka, IBAN. En fazla 1000 karakter.">
        <Textarea
          id="payment-info"
          rows={5}
          maxLength={1000}
          value={value}
          disabled={loading}
          placeholder={"Alıcı: Ad Soyad\nBanka: ...\nIBAN: TR.."}
          onChange={(event) => setValue(event.target.value)}
        />
      </FormField>
    </FormModal>
  );
}
