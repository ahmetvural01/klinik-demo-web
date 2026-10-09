"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { showToastSafe } from "@/lib/toast-client";
import { formatCurrency } from "@/lib/format";
import { formatDateText } from "@/components/ui/Money";
import {
  expiryState,
  formatQuantity,
  friendlyStockError,
  lotGap,
  maxStockOut,
  newRequestKey,
  type StockItem,
} from "@/components/stock/stock-shared";

type MoveType = "CIKIS" | "IMHA" | "GIRIS";

type LotPreview = { id: string; lotNo?: string | null; expiresAt?: string | null; receivedAt: string; quantityRemaining: number; status: string };

/**
 * Çıkışın hangi partilerden düşeceğini sunucudaki sırayla (en yakın SKT önce,
 * SKT'siz en son, sonra geliş tarihi) tahmin eder; yalnız bilgilendirme içindir.
 */
function previewAllocation(lots: LotPreview[], quantity: number) {
  const usable = lots
    .filter((lot) => lot.status === "AKTIF" && lot.quantityRemaining > 0)
    .sort((a, b) => {
      if (a.expiresAt && b.expiresAt) return a.expiresAt.localeCompare(b.expiresAt) || a.receivedAt.localeCompare(b.receivedAt);
      if (a.expiresAt) return -1;
      if (b.expiresAt) return 1;
      return a.receivedAt.localeCompare(b.receivedAt);
    });
  const result: { lot: LotPreview; used: number }[] = [];
  let remaining = quantity;
  for (const lot of usable) {
    if (remaining <= 0) break;
    const used = Math.min(lot.quantityRemaining, remaining);
    result.push({ lot, used });
    remaining -= used;
  }
  return result;
}

type StockMovementModalProps = {
  open: boolean;
  item: StockItem | null;
  /** Pencere açılırken seçili hareket türü. */
  initialType?: MoveType;
  /** Maliyet alanı (finance:read); yoksa giriş ortalama maliyetle değerlenir. */
  canSeeCost?: boolean;
  onClose: () => void;
  onSaved: (item: StockItem) => void;
};

/**
 * Stok hareketi: kullanım çıkışı veya sayım fazlası / iade girişi. Önceden
 * pencere yalnız "Stok Çıkışı"ydı; yanlış çıkışı geri almanın ya da sayım
 * farkını girmenin arayüzde yolu yoktu (API destekliyordu). Aynı istek
 * anahtarı ağ hatası sonrası "Kaydet"e yeniden basılınca miktarın ikinci kez
 * değişmesini önler.
 */
export function StockMovementModal({ open, item, initialType = "CIKIS", canSeeCost = true, onClose, onSaved }: StockMovementModalProps) {
  const [type, setType] = useState<MoveType>(initialType);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [errors, setErrors] = useState<{ quantity?: string; note?: string; unitCost?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lots, setLots] = useState<LotPreview[]>([]);
  const requestKeyRef = useRef("");
  const itemId = item?.id || "";

  useEffect(() => {
    if (!open || !itemId) return;
    let cancelled = false;
    setLots([]);
    fetch(`/api/stock/${itemId}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (!cancelled && Array.isArray(body?.lots)) setLots(body.lots); })
      .catch(() => { /* parti önizlemesi yalnız bilgi amaçlı */ });
    return () => { cancelled = true; };
  }, [open, itemId]);

  useEffect(() => {
    if (!open) return;
    setType(initialType);
    setQuantity("");
    setNote("");
    setUnitCost(item?.averageUnitPrice ? String(item.averageUnitPrice) : "");
    setErrors({});
    setFormError(null);
    requestKeyRef.current = newRequestKey("stock-move");
  }, [open, initialType, item]);

  if (!item) return null;
  const maxOut = maxStockOut(item);
  const gap = lotGap(item);
  const isOut = type !== "GIRIS";
  const previewQuantity = /^\d+$/.test(quantity.trim()) ? Math.min(Number(quantity), maxOut) : 0;
  const allocation = isOut && previewQuantity > 0 ? previewAllocation(lots, previewQuantity) : [];
  const expiredUsed = allocation.filter((entry) => expiryState(entry.lot.expiresAt) === "expired");

  const submit = async () => {
    if (saving) return;
    const raw = quantity.trim();
    const next: typeof errors = {};
    if (!raw) next.quantity = "Miktarı girin.";
    else if (!/^\d+$/.test(raw) || Number(raw) <= 0) next.quantity = "Miktar tam sayı olmalı (ör. 1, 2, 3).";
    else if (isOut && Number(raw) > maxOut) {
      next.quantity = maxOut <= 0
        ? "Bu üründen çıkış yapılabilecek miktar yok."
        : `En fazla ${formatQuantity(maxOut, item.unit)} çıkış yapılabilir.`;
    }
    if (type === "GIRIS" && !note.trim()) next.note = "Girişin nedenini yazın (ör. sayım fazlası, hatalı çıkışın geri alınması).";
    if (type === "IMHA" && !note.trim()) next.note = "İmha nedenini yazın (ör. son kullanma tarihi geçti, kutu hasarlı).";
    if (type === "GIRIS" && unitCost.trim() !== "" && (!Number.isFinite(Number(unitCost)) || Number(unitCost) < 0)) next.unitCost = "Geçerli bir tutar girin.";
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch(`/api/stock/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current || newRequestKey("stock-move") },
        // İmha ayrı bir hareket türü değildir: çıkış olarak, notun başında
        // "İmha" yazarak kaydedilir (hareket geçmişinde ayırt edilir).
        body: JSON.stringify({
          type: type === "GIRIS" ? "GIRIS" : "CIKIS",
          quantity: Number(raw),
          note: type === "IMHA" ? `İmha: ${note.trim()}` : note.trim() || undefined,
          ...(type === "GIRIS" && canSeeCost && unitCost.trim() !== "" ? { unitPrice: Number(unitCost) } : {}),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(friendlyStockError(body?.error || body?.message, "Stok hareketi kaydedilemedi. Bilgileri kontrol edin."));
      }
      requestKeyRef.current = "";
      showToastSafe({
        title: type === "GIRIS" ? "Giriş kaydedildi" : type === "IMHA" ? "İmha kaydedildi" : "Çıkış kaydedildi",
        message: `${item.name}: ${isOut ? "−" : "+"}${formatQuantity(Number(raw), item.unit)} · kalan ${formatQuantity(Number(body?.quantity ?? 0), item.unit)}`,
        type: "success",
        icon: "box",
      });
      onSaved({ ...item, ...(body as Partial<StockItem>) } as StockItem);
      onClose();
    } catch (error) {
      // İstek anahtarı korunur: yeniden "Kaydet" aynı hareketi ikinci kez yazmaz.
      setFormError(error instanceof Error ? error.message : "Bağlantı kurulamadı. Bilgiler korundu, tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      module="box"
      title="Stok hareketi"
      description={`${item.name} · Mevcut ${formatQuantity(item.quantity, item.unit)}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button>
          <Button onClick={() => void submit()} loading={saving}>Kaydet</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <FormErrorBanner message={formError} />
        <ChoiceCards<MoveType>
          label="Hareket"
          value={type}
          onChange={(value) => { setType(value); setErrors({}); }}
          columns={3}
          options={[
            { value: "CIKIS", label: "Kullanım", description: "Tedavide kullanıldı." },
            { value: "IMHA", label: "İmha / fire", description: "SKT geçti, kırıldı, atıldı." },
            { value: "GIRIS", label: "Giriş", description: "Sayım fazlası, hatalı çıkışın geri alınması." },
          ]}
        />
        {isOut && gap > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            Bu ürünün {formatQuantity(gap, item.unit)} kadarının parti (lot) kaydı yok; çıkış yalnız partili {formatQuantity(maxOut, item.unit)} için yapılabilir.
            Kalan miktar için yöneticinize bildirin.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            label="Miktar"
            htmlFor="stock-move-quantity"
            required
            error={errors.quantity}
            hint={isOut ? `En fazla ${formatQuantity(maxOut, item.unit)}` : `Birim: ${item.unit}`}
          >
            <Input
              id="stock-move-quantity"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              max={isOut ? maxOut : undefined}
              value={quantity}
              onChange={(event) => { setQuantity(event.target.value); setErrors((current) => ({ ...current, quantity: undefined })); }}
              data-autofocus
            />
          </FormField>
          {type === "GIRIS" && canSeeCost && (
            <FormField
              label="Birim maliyet (₺)"
              htmlFor="stock-move-cost"
              error={errors.unitCost}
              hint={item.averageUnitPrice ? `Ortalama maliyet önerildi (${formatCurrency(item.averageUnitPrice)}).` : "Bilmiyorsanız boş bırakın."}
            >
              <Input id="stock-move-cost" type="number" inputMode="decimal" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} />
            </FormField>
          )}
        </div>
        {allocation.length > 0 && (
          <div className={`rounded-lg border px-3 py-2 text-xs leading-5 ${expiredUsed.length > 0 && type === "CIKIS" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
            <p className="font-semibold">Düşülecek parti</p>
            {allocation.map((entry) => (
              <p key={entry.lot.id}>
                {entry.lot.lotNo || "Lot no yok"} · SKT {entry.lot.expiresAt ? formatDateText(entry.lot.expiresAt) : "yok"} · {formatQuantity(entry.used, item.unit)}
                {expiryState(entry.lot.expiresAt) === "expired" ? " (süresi geçmiş)" : ""}
              </p>
            ))}
            {expiredUsed.length > 0 && type === "CIKIS" && (
              <p className="mt-1 font-semibold">Süresi geçmiş partiden düşülecek. Ürün hastada kullanılmadıysa “İmha / fire” seçin.</p>
            )}
          </div>
        )}
        <FormField
          label={type === "CIKIS" ? "Açıklama" : "Neden"}
          htmlFor="stock-move-note"
          required={type !== "CIKIS"}
          error={errors.note}
        >
          <Input
            id="stock-move-note"
            value={note}
            onChange={(event) => { setNote(event.target.value); setErrors((current) => ({ ...current, note: undefined })); }}
            placeholder={type === "GIRIS" ? "Ör. Sayımda 2 adet fazla çıktı" : type === "IMHA" ? "Ör. Son kullanma tarihi geçti" : "Ör. Ayşe Yılmaz implant tedavisi"}
          />
        </FormField>
      </div>
    </Modal>
  );
}
