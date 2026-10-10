"use client";

import { useEffect, useRef, useState } from "react";
import { FormModal } from "@/components/ui/FormModal";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Callout } from "@/components/ui/Callout";
import { formatDateText } from "@/components/ui/Money";
import { ManagerRequestButton } from "@/components/takip/ManagerRequestButton";
import { showToastSafe } from "@/lib/toast-client";
import { formatCurrency } from "@/lib/format";
import { moneyInputError, toMoneyValue } from "@/lib/money-input";
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

/** Çıkış önizlemesi için parti bilgisi (ürün detayından gelir ya da burada okunur). */
export type StockLotPreview = { id: string; lotNo?: string | null; expiresAt?: string | null; receivedAt: string; quantityRemaining: number; status: string };

const TYPE_HINT: Record<MoveType, string> = {
  CIKIS: "Tedavide kullanılan miktar stoktan düşülür.",
  IMHA: "SKT'si geçen, kırılan ya da atılan miktar düşülür.",
  GIRIS: "Sayım fazlası ya da hatalı çıkışın geri alınması.",
};

/**
 * Çıkışın hangi partilerden düşeceğini sunucudaki sırayla (en yakın SKT önce,
 * SKT'siz en son, sonra geliş tarihi) tahmin eder; yalnız bilgilendirme içindir.
 */
function previewAllocation(lots: StockLotPreview[], quantity: number) {
  const usable = lots
    .filter((lot) => lot.status === "AKTIF" && lot.quantityRemaining > 0)
    .sort((a, b) => {
      if (a.expiresAt && b.expiresAt) return a.expiresAt.localeCompare(b.expiresAt) || a.receivedAt.localeCompare(b.receivedAt);
      if (a.expiresAt) return -1;
      if (b.expiresAt) return 1;
      return a.receivedAt.localeCompare(b.receivedAt);
    });
  const result: { lot: StockLotPreview; used: number }[] = [];
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
  /**
   * Ürün detayından açılınca partiler zaten yüklüdür; verilirse ikinci kez
   * istenmez. Verilmezse (listeden açılış) parti önizlemesi burada okunur.
   */
  lots?: StockLotPreview[] | null;
  onClose: () => void;
  onSaved: (item: StockItem) => void;
};

/**
 * Stok hareketi: kullanım çıkışı, imha/fire veya sayım fazlası/iade girişi.
 * Asistanın en sık işi "2 kartuş kullandım": miktar alanı açılışta odaktadır,
 * Enter kaydeder. Aynı istek anahtarı ağ hatası sonrası "Kaydet"e yeniden
 * basılınca miktarın ikinci kez değişmesini önler.
 */
export function StockMovementModal({ open, item, initialType = "CIKIS", canSeeCost = true, lots: lotsProp, onClose, onSaved }: StockMovementModalProps) {
  const [type, setType] = useState<MoveType>(initialType);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [errors, setErrors] = useState<{ quantity?: string; note?: string; unitCost?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fetchedLots, setFetchedLots] = useState<StockLotPreview[]>([]);
  const requestKeyRef = useRef("");
  const itemId = item?.id || "";
  const hasLotsProp = Array.isArray(lotsProp);

  useEffect(() => {
    if (!open || !itemId || hasLotsProp) return;
    let cancelled = false;
    setFetchedLots([]);
    fetch(`/api/stock/${itemId}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (!cancelled && Array.isArray(body?.lots)) setFetchedLots(body.lots); })
      .catch(() => { /* parti önizlemesi yalnız bilgi amaçlı */ });
    return () => { cancelled = true; };
  }, [open, itemId, hasLotsProp]);

  // Önerilen maliyet son çizimden okunur; form yalnız pencere açılırken (ya da
  // başka ürüne geçince) sıfırlanır — açıkken liste yenilenince yazılanlar silinmez.
  const averageCostRef = useRef<number | null | undefined>(null);
  useEffect(() => { averageCostRef.current = item?.averageUnitPrice; });
  useEffect(() => {
    if (!open) return;
    setType(initialType);
    setQuantity("");
    setNote("");
    setUnitCost(toMoneyValue(averageCostRef.current) ?? "");
    setErrors({});
    setFormError(null);
    requestKeyRef.current = newRequestKey("stock-move");
  }, [open, initialType, itemId]);

  if (!item) return null;
  const lots = hasLotsProp ? (lotsProp as StockLotPreview[]) : fetchedLots;
  const maxOut = maxStockOut(item);
  const gap = lotGap(item);
  const isOut = type !== "GIRIS";
  const previewQuantity = /^\d+$/.test(quantity.trim()) ? Math.min(Number(quantity), maxOut) : 0;
  const allocation = isOut && previewQuantity > 0 ? previewAllocation(lots, previewQuantity) : [];
  const expiredUsed = allocation.some((entry) => expiryState(entry.lot.expiresAt) === "expired");

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
    if (type === "GIRIS" && canSeeCost && unitCost.trim() !== "") {
      const costError = moneyInputError(unitCost, { allowZero: true });
      if (costError) next.unitCost = costError;
    }
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
          ...(type === "GIRIS" && canSeeCost && unitCost.trim() !== "" ? { unitPrice: unitCost } : {}),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(friendlyStockError(body?.error || body?.message, "Stok hareketi kaydedilemedi. Bilgileri kontrol edin."));
      }
      requestKeyRef.current = "";
      showToastSafe({
        title: type === "GIRIS" ? "Giriş kaydedildi" : type === "IMHA" ? "İmha kaydedildi" : "Stoktan düşüldü",
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
    <FormModal
      open={open}
      onClose={onClose}
      module="box"
      title="Stok hareketi"
      description={`${item.name} · Mevcut ${formatQuantity(item.quantity, item.unit)}`}
      onSubmit={() => submit()}
      submitting={saving}
      error={formError}
    >
      <ChoiceCards<MoveType>
        label="Hareket"
        variant="pills"
        value={type}
        onChange={(value) => { setType(value); setErrors({}); }}
        hint={TYPE_HINT[type]}
        options={[
          { value: "CIKIS", label: "Kullanım" },
          { value: "IMHA", label: "İmha / fire" },
          { value: "GIRIS", label: "Giriş" },
        ]}
      />
      {isOut && gap > 0 && (
        <Callout
          tone="warning"
          compact
          action={(
            <ManagerRequestButton
              label="Yöneticiye bildir"
              taskTitle={`Partisiz stok için açılış partisi gerekli: ${item.name}`}
              taskDetails={`${formatQuantity(gap, item.unit)} için parti (lot) kaydı yok; bu miktardan stok çıkışı yapılamıyor.`}
              taskType="PARCA_SIPARIS"
            />
          )}
        >
          {formatQuantity(gap, item.unit)} için parti (lot) kaydı yok; çıkış yalnız partili {formatQuantity(maxOut, item.unit)} için yapılabilir. Partisiz stok için açılış partisi gerekli.
        </Callout>
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
            label="Birim maliyet"
            htmlFor="stock-move-cost"
            error={errors.unitCost}
            hint={item.averageUnitPrice ? `Ortalama maliyet önerildi (${formatCurrency(item.averageUnitPrice)}).` : "Bilmiyorsanız boş bırakın."}
          >
            <MoneyInput id="stock-move-cost" value={unitCost} onChange={(value) => { setUnitCost(value); setErrors((current) => ({ ...current, unitCost: undefined })); }} />
          </FormField>
        )}
      </div>
      {allocation.length > 0 && (
        <Callout tone={expiredUsed && type === "CIKIS" ? "warning" : "neutral"} compact title="Düşülecek parti">
          {allocation.map((entry) => (
            <span key={entry.lot.id} className="block">
              {entry.lot.lotNo || "Lot no yok"} · SKT {entry.lot.expiresAt ? formatDateText(entry.lot.expiresAt) : "yok"} · {formatQuantity(entry.used, item.unit)}
              {expiryState(entry.lot.expiresAt) === "expired" ? " (süresi geçmiş)" : ""}
            </span>
          ))}
          {expiredUsed && type === "CIKIS" && (
            <span className="mt-1 block font-semibold">Süresi geçmiş partiden düşülecek. Ürün hastada kullanılmadıysa “İmha / fire” seçin.</span>
          )}
        </Callout>
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
          placeholder={type === "GIRIS" ? "Ör. Sayımda 2 adet fazla çıktı" : type === "IMHA" ? "Ör. Son kullanma tarihi geçti" : "Ör. 36 numara kanal tedavisi"}
        />
      </FormField>
    </FormModal>
  );
}
