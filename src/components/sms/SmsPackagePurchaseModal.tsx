"use client";

import { useEffect, useState } from "react";
import { FormModal } from "@/components/ui/FormModal";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Callout } from "@/components/ui/Callout";
import { Button } from "@/components/ui/Button";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { SMS_CREDIT_REQUEST_HREF, formatCount } from "@/components/sms/communication-labels";
import { formatDateText } from "@/components/ui/Money";
import { showToastSafe } from "@/lib/toast-client";

type SmsPackageOption = { id: string; name: string; smsCount: number; price: number; description: string | null };
type PackagesResponse = { packages: SmsPackageOption[]; dueDays: number; canBuy: boolean };

function price(value: number) {
  return `${value.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₺`;
}

function unitPrice(item: SmsPackageOption) {
  if (item.smsCount <= 0) return "";
  return `SMS başı ${(item.price / item.smsCount).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

/**
 * İletişim › "SMS paketi al": klinik paketi kendisi seçer, kredi hemen
 * yüklenir; tutar 7 gün vadeli fatura olarak Ayarlar › Abonelik'e düşer.
 * Önceden "Kredi iste" destek talebi açıyor, yükleme elle bekleniyordu.
 */
export function SmsPackagePurchaseModal({ open, onClose, onPurchased }: { open: boolean; onClose: () => void; onPurchased: (balance: number) => void }) {
  const [data, setData] = useState<PackagesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFormError(null);
    setLoadError(null);
    fetch("/api/sms/packages", { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(json?.message || "Paketler yüklenemedi");
        return json as PackagesResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setSelected((current) => current && json.packages.some((item) => item.id === current) ? current : json.packages[0]?.id ?? "");
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Paketler yüklenemedi");
      });
    return () => { cancelled = true; };
  }, [open]);

  const choice = data?.packages.find((item) => item.id === selected) ?? null;
  const dueDate = data ? new Date(Date.now() + data.dueDays * 86_400_000).toISOString() : null;
  const noPackages = Boolean(data && data.packages.length === 0);

  const submit = async () => {
    if (!choice || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch("/api/sms/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsPackageId: choice.id }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setFormError(json?.message || "Paket alınamadı");
        return;
      }
      onPurchased(Number(json.balance) || 0);
      showToastSafe({ type: "success", message: `${formatCount(choice.smsCount)} SMS yüklendi. Fatura ${price(choice.price)}, son ödeme ${formatDateText(json.invoice?.dueDate ?? dueDate ?? new Date())}.` });
      onClose();
    } catch {
      setFormError("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="SMS paketi al"
      description="Kredi hemen yüklenir; tutar faturanıza eklenir."
      size="md"
      onSubmit={() => void submit()}
      submitting={saving}
      submitLabel={choice ? `${price(choice.price)} · Satın al` : "Satın al"}
      submitDisabled={!choice || data?.canBuy === false}
      hideSubmit={noPackages || Boolean(loadError)}
      error={formError}
    >
      {loadError ? (
        <Callout tone="critical" compact>{loadError}</Callout>
      ) : !data ? (
        <ListRowSkeleton variant="row" rows={3} />
      ) : noPackages ? (
        <Callout tone="info" compact action={<Button variant="secondary" size="sm" href={SMS_CREDIT_REQUEST_HREF}>Destek&apos;e yaz</Button>}>
          Şu an satışta paket yok.
        </Callout>
      ) : (
        <>
          <ChoiceCards
            label="Paket"
            labelHidden
            value={selected}
            onChange={setSelected}
            columns={data.packages.length >= 3 ? 3 : 2}
            options={data.packages.map((item) => ({
              value: item.id,
              label: `${formatCount(item.smsCount)} SMS`,
              description: `${price(item.price)} · ${unitPrice(item)}`,
            }))}
          />
          {choice && (
            <p className="text-sm text-slate-600">
              Son ödeme tarihi <span className="font-semibold text-slate-900">{dueDate ? formatDateText(dueDate) : ""}</span>. Faturayı Ayarlar › Abonelik&apos;te görürsünüz.
            </p>
          )}
          {data.canBuy === false && <Callout tone="warning" compact>Süperadmin girişinde paket satışı klinik dosyasından yapılır.</Callout>}
        </>
      )}
    </FormModal>
  );
}
