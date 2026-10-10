"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { FormField } from "@/components/ui/FormField";
import { Select } from "@/components/ui/Input";
import { cachedGet } from "@/lib/client-cache";
import {
  PAYMENT_METHOD_VALUES,
  paymentMethodOptions,
  requiresPos,
  type PaymentMethod,
} from "@/lib/payment-methods";

export type PosDevice = { id: string; name: string; isActive: boolean };

/**
 * POS cihaz listesi — yalnız gerektiğinde (kart / mail order seçilince) ve
 * 60 sn önbellekten okunur. Önceden tahsilat, taksit, plan ve düzeltme
 * pencerelerinin her biri açılışta ayrı istek atıyordu (çoğu tahsilat nakit).
 * `devices` null iken yükleniyor demektir.
 */
export function usePosDevices(enabled: boolean) {
  const [state, setState] = useState<{ devices: PosDevice[] | null; error: string }>({ devices: null, error: "" });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    cachedGet<PosDevice[]>("/api/pos-devices", 60_000, { throwOnError: true })
      .then((list) => { if (active) setState({ devices: Array.isArray(list) ? list : [], error: "" }); })
      .catch((loadError: unknown) => {
        if (active) setState({ devices: [], error: loadError instanceof Error && loadError.message ? loadError.message : "POS cihazları yüklenemedi." });
      });
    return () => { active = false; };
  }, [enabled]);
  return state;
}

type PosProps = {
  value: string;
  onChange: (posId: string) => void;
  /** Alan hatası ("POS seçin"). */
  error?: string;
  /** Düzeltmede kayıttaki (artık pasif olabilecek) cihaz listede kalsın. */
  keepId?: string | null;
  /** Ayarlar'a bağlantı gösterilsin mi (settings:write). */
  canManage?: boolean;
};

type Props = {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  /** Gösterilecek yöntemler (verilen sırayla). Varsayılan hepsi. */
  methods?: readonly PaymentMethod[];
  label?: string;
  hint?: string;
  error?: string;
  /** Alan kimliklerinin öneki (aynı sayfada iki seçici olabilir). */
  idPrefix: string;
  /** Verilirse kart / mail order seçilince POS cihazı alanı çıkar (yalnız hastadan tahsilat). */
  pos?: PosProps;
};

/**
 * Ödeme yöntemi — TEK görünüm: kısa düğmeler (pills), kart / mail order
 * seçilince POS cihazı. Tek POS cihazı varsa kendiliğinden seçilir (gereksiz
 * adım). Önceden Muhasebe formları açılır liste, hasta dosyası düğme
 * kullanıyordu ve yöntem adları farklı yazılıyordu.
 */
export function PaymentMethodPicker({ value, onChange, methods = PAYMENT_METHOD_VALUES, label = "Ödeme yöntemi", hint, error, idPrefix, pos }: Props) {
  const needsPos = Boolean(pos) && requiresPos(value);
  const { devices, error: loadError } = usePosDevices(needsPos);
  const usable = (devices || []).filter((device) => device.isActive || device.id === pos?.keepId);
  const singleId = usable.length === 1 && usable[0].isActive ? usable[0].id : "";
  const posValue = pos?.value || "";
  const onPosChange = pos?.onChange;

  // Tek POS cihazı varsa kart seçilince otomatik seçilir.
  useEffect(() => {
    if (!needsPos || posValue || !singleId || !onPosChange) return;
    onPosChange(singleId);
  }, [needsPos, posValue, singleId, onPosChange]);

  const posHint = !needsPos
    ? undefined
    : loadError
      ? loadError
      : devices && usable.length === 0
        ? "Kayıtlı POS cihazı yok."
        : undefined;

  return (
    <div className="space-y-3">
      <ChoiceCards
        label={label}
        variant="pills"
        options={paymentMethodOptions(methods)}
        value={value}
        onChange={onChange}
        error={error}
        hint={hint}
      />
      {pos && needsPos && (
        <FormField label="POS cihazı" htmlFor={`${idPrefix}-pos`} required error={pos.error} hint={pos.error ? undefined : posHint}>
          <Select id={`${idPrefix}-pos`} value={posValue} onChange={(event) => pos.onChange(event.target.value)} disabled={!devices}>
            <option value="">{devices ? "POS cihazı seçin" : "Yükleniyor…"}</option>
            {usable.map((device) => (
              <option key={device.id} value={device.id}>{device.name}{device.isActive ? "" : " (kullanım dışı)"}</option>
            ))}
          </Select>
        </FormField>
      )}
      {pos?.canManage && needsPos && devices && usable.length === 0 && !loadError && (
        <p className="-mt-1 text-xs text-slate-500">
          POS cihazını <Link href="/ayar?tab=pos" className="font-semibold text-primary underline">Ayarlar › POS cihazları</Link> bölümünden ekleyin.
        </p>
      )}
    </div>
  );
}
