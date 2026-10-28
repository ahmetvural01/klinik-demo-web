"use client";

import { useEffect, useRef, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { FormModal } from "@/components/ui/FormModal";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ManagerRequestButton } from "@/components/takip/ManagerRequestButton";
import { showToastSafe } from "@/lib/toast-client";
import {
  formatQuantity,
  friendlyStockError,
  newRequestKey,
  type StockItem,
} from "@/components/stock/stock-shared";

/** "GIRIS" ekranda "Sayım fazlası"dır: satın alınan ürün Satın alma'dan girer (firma borcu ve gideriyle). */
type MoveType = "CIKIS" | "IMHA" | "GIRIS";

const TYPE_HINT: Record<Exclude<MoveType, "GIRIS">, string> = {
  CIKIS: "Tedavide kullanılan miktar stoktan düşülür.",
  IMHA: "Bozulan, kırılan ya da tarihi geçen ürün düşülür.",
};

const NOTE_PLACEHOLDER: Record<MoveType, string> = {
  CIKIS: "Ör. 36 numara kanal tedavisi",
  IMHA: "Ör. Tarihi geçti, kutu hasarlı",
  GIRIS: "Ör. Dolapta 2 kutu daha çıktı",
};

const SAVED_TITLE: Record<MoveType, string> = {
  CIKIS: "Stoktan düşüldü",
  IMHA: "İmha kaydedildi",
  GIRIS: "Sayım fazlası eklendi",
};

type StockMovementModalProps = {
  open: boolean;
  item: StockItem | null;
  /** Pencere açılırken seçili hareket türü. */
  initialType?: MoveType;
  /**
   * Satın alma yetkisi varsa verilir: "Sayım fazlası"ndaki "Satın alma gir"
   * bu ürünle (yazılan miktarla) satın alma formunu açar. Yetki yoksa
   * kullanıcı durumu yöneticiye bildirir.
   */
  onPurchase?: (item: StockItem, quantity: number | null) => void;
  onClose: () => void;
  onSaved: (item: StockItem) => void;
};

/**
 * Stok hareketi: kullanım, imha/fire ya da sayım fazlası. Asistanın en sık işi
 * "2 kartuş kullandım": miktar alanı açılışta odaktadır, Enter kaydeder.
 * Kullanım ve imha stoktan sırayla (önce eski stok) düşer; maliyet sunucuda
 * kendiliğinden hesaplanır. Sayım fazlasının maliyeti sorulmaz (kalan stoğun
 * ortalaması ya da son alış fiyatı kullanılır). Aynı istek anahtarı ağ hatası
 * sonrası "Kaydet"e yeniden basılınca miktarın ikinci kez değişmesini önler.
 */
export function StockMovementModal({ open, item, initialType = "CIKIS", onPurchase, onClose, onSaved }: StockMovementModalProps) {
  const [type, setType] = useState<MoveType>(initialType);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ quantity?: string; note?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestKeyRef = useRef("");
  const itemId = item?.id || "";

  // Form yalnız pencere açılırken (ya da başka ürüne geçince) sıfırlanır —
  // açıkken liste yenilenince yazılanlar silinmez.
  useEffect(() => {
    if (!open) return;
    setType(initialType);
    setQuantity("");
    setNote("");
    setErrors({});
    setFormError(null);
    requestKeyRef.current = newRequestKey("stock-move");
  }, [open, initialType, itemId]);

  if (!item) return null;
  const isOut = type !== "GIRIS";
  const available = Math.max(0, Number(item.quantity));
  const typedQuantity = /^\d+$/.test(quantity.trim()) && Number(quantity) > 0 ? Number(quantity) : null;

  const submit = async () => {
    if (saving) return;
    const raw = quantity.trim();
    const next: typeof errors = {};
    if (!raw) next.quantity = "Miktarı girin.";
    else if (!/^\d+$/.test(raw) || Number(raw) <= 0) next.quantity = "Miktar tam sayı olmalı (ör. 1, 2, 3).";
    else if (isOut && Number(raw) > available) {
      next.quantity = available <= 0
        ? "Stokta bu üründen yok."
        : `En fazla ${formatQuantity(available, item.unit)} düşülebilir.`;
    }
    if (type === "IMHA" && !note.trim()) next.note = "İmha nedenini yazın (ör. tarihi geçti, kutu hasarlı).";
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    const text = note.trim();
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch(`/api/stock/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current || newRequestKey("stock-move") },
        // İmha ve sayım fazlası ayrı hareket türü değildir: çıkış/giriş olarak,
        // notun başında türü yazarak kaydedilir (hareket geçmişinde ayırt edilir).
        body: JSON.stringify({
          type: type === "GIRIS" ? "GIRIS" : "CIKIS",
          quantity: Number(raw),
          note: type === "IMHA"
            ? `İmha: ${text}`
            : type === "GIRIS"
              ? text ? `Sayım fazlası: ${text}` : "Sayım fazlası"
              : text || undefined,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(friendlyStockError(body?.error || body?.message, "Stok hareketi kaydedilemedi. Bilgileri kontrol edin."));
      }
      requestKeyRef.current = "";
      showToastSafe({
        title: SAVED_TITLE[type],
        message: `${item.name}: ${isOut ? "−" : "+"}${formatQuantity(Number(raw), item.unit)} · stokta ${formatQuantity(Number(body?.quantity ?? 0), item.unit)}`,
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
        hint={type === "GIRIS" ? undefined : TYPE_HINT[type]}
        options={[
          { value: "CIKIS", label: "Kullanım" },
          { value: "IMHA", label: "İmha / fire" },
          { value: "GIRIS", label: "Sayım fazlası" },
        ]}
      />
      {type === "GIRIS" && (
        // Satın alınan ürün buradan girilirse tedarikçi borcu ve gideri oluşmaz:
        // yol Satın alma'ya yönlendirilir.
        <Callout
          tone="info"
          compact
          inline
          action={onPurchase ? (
            <Button size="sm" variant="ghost" icon={ShoppingCart} onClick={() => onPurchase(item, typedQuantity)}>
              Satın alma gir
            </Button>
          ) : (
            <ManagerRequestButton
              label="Yöneticiye bildir"
              variant="ghost"
              taskTitle={`Satın alma girilecek: ${item.name}`}
              taskDetails={`Tedarikçiden gelen ürün Satın alma'dan girilmeli; stok ve firma borcu birlikte işlenir.${typedQuantity ? ` Gelen miktar: ${formatQuantity(typedQuantity, item.unit)}.` : ""}`}
              taskType="PARCA_SIPARIS"
            />
          )}
        >
          {onPurchase
            ? "Sayımda fazla çıkan ürün; satın aldıysanız Satın alma'dan girin."
            : "Sayımda fazla çıkan ürün; satın alınan ürünü yönetici Satın alma'dan girer."}
        </Callout>
      )}
      <FormField label={`Miktar (${item.unit})`} htmlFor="stock-move-quantity" required error={errors.quantity}>
        <Input
          id="stock-move-quantity"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          max={isOut ? available : undefined}
          value={quantity}
          onChange={(event) => { setQuantity(event.target.value); setErrors((current) => ({ ...current, quantity: undefined })); }}
          data-autofocus
        />
      </FormField>
      <FormField
        label={type === "IMHA" ? "Neden" : "Açıklama"}
        htmlFor="stock-move-note"
        required={type === "IMHA"}
        error={errors.note}
      >
        <Input
          id="stock-move-note"
          value={note}
          onChange={(event) => { setNote(event.target.value); setErrors((current) => ({ ...current, note: undefined })); }}
          placeholder={NOTE_PLACEHOLDER[type]}
        />
      </FormField>
    </FormModal>
  );
}
