"use client";

import { useEffect, useRef, useState } from "react";
import { FormModal } from "@/components/ui/FormModal";
import { FormField } from "@/components/ui/FormField";
import { Disclosure } from "@/components/ui/Disclosure";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { showToastSafe } from "@/lib/toast-client";
import { FIRMA_KATEGORILERI, compactIban, formatIban, ibanError, type FirmaFormValues } from "@/components/firma/firma-shared";

type FirmaFormModalProps = {
  open: boolean;
  /** Verilirse düzenleme; verilmezse yeni tedarikçi. */
  firma?: FirmaFormValues | null;
  onClose: () => void;
  /** `kategori`: kaydedilen tür (ör. lab formu yalnız "LAB" seçilince laboratuvarı seçer). */
  onSaved: (firma: { id: string; name: string; kategori?: string }) => void | Promise<void>;
  /** Yeni kayıtta önceden seçili tür (ör. lab işi formundan "LAB"). Düzenlemede kullanılmaz. */
  defaultKategori?: string;
};

const EMPTY = { name: "", kategori: "TEDARICI", phone: "", iban: "", ibanName: "", notes: "" };
const NETWORK_ERROR = "Bağlantı kurulamadı. Bilgiler korundu, tekrar deneyin.";

/**
 * Tedarikçi (firma) ekleme ve düzenleme için TEK form. Önceden Satın alma
 * listesinde ve tedarikçi sayfasında iki ayrı kopya vardı (biri IBAN ipucu
 * içeriyor, diğeri içermiyordu). Zorunlu: ad ve tür; ödeme bilgileri ve not
 * "Diğer bilgiler" altında. IBAN kaydetmeden önce doğrulanır (önceden "TR12
 * 3456 abc" kabul edilip "kopyala" düğmesiyle sunuluyordu).
 */
export function FirmaFormModal({ open, firma, onClose, onSaved, defaultKategori }: FirmaFormModalProps) {
  const isEdit = Boolean(firma?.id);
  const isNewLab = !isEdit && defaultKategori === "LAB";
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<{ name?: string; iban?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Form yalnız pencere AÇILIRKEN doldurulur. Tedarikçi sayfası odakta/gerçek
  // zamanlı olayda firmayı yeniden okuyup yeni nesne veriyor; bağımlılıkta
  // `firma` olunca (ör. IBAN'ı bankadan kopyalayıp sekmeye dönünce) yazılanlar siliniyordu.
  const firmaRef = useRef(firma);
  const defaultKategoriRef = useRef(defaultKategori);
  useEffect(() => { firmaRef.current = firma; defaultKategoriRef.current = defaultKategori; });
  useEffect(() => {
    if (!open) return;
    const initial = firmaRef.current;
    const next = initial ? {
      name: initial.name,
      kategori: initial.kategori || "TEDARICI",
      phone: initial.phone || "",
      iban: initial.iban ? formatIban(initial.iban) : "",
      ibanName: initial.ibanName || "",
      notes: initial.notes || "",
    } : { ...EMPTY, kategori: defaultKategoriRef.current && FIRMA_KATEGORILERI[defaultKategoriRef.current] ? defaultKategoriRef.current : EMPTY.kategori };
    setForm(next);
    setErrors({});
    setFormError(null);
    setDetailsOpen(Boolean(next.iban || next.ibanName || next.notes));
  }, [open]);

  const set = (key: keyof typeof EMPTY, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "name" || key === "iban") setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async () => {
    if (saving) return;
    const nextErrors: typeof errors = {};
    if (form.name.trim().length < 2) nextErrors.name = "Firma adını yazın (en az 2 harf).";
    const ibanProblem = ibanError(form.iban);
    if (ibanProblem) nextErrors.iban = ibanProblem;
    setErrors(nextErrors);
    if (nextErrors.iban) setDetailsOpen(true);
    if (nextErrors.name || nextErrors.iban) return;
    setSaving(true);
    setFormError(null);
    const name = form.name.trim();
    try {
      // Ağ hatası ayrı yakalanır: tarayıcının İngilizce "Failed to fetch" iletisi kullanıcıya gösterilmez.
      const response = await fetch(isEdit ? `/api/firma/${firma?.id}` : "/api/firma", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          kategori: form.kategori,
          // Düzenlemede boş metin alanı siler (sunucu boşu null yapar); yeni kayıtta null gönderilir.
          phone: form.phone.trim() || (isEdit ? "" : null),
          iban: form.iban.trim() ? formatIban(form.iban) : (isEdit ? "" : null),
          ibanName: form.ibanName.trim() || (isEdit ? "" : null),
          notes: form.notes.trim() || (isEdit ? "" : null),
        }),
      }).catch(() => null);
      if (!response) {
        setFormError(NETWORK_ERROR);
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || body?.message || (isEdit ? "Firma güncellenemedi." : "Firma eklenemedi. Bilgileri kontrol edip tekrar deneyin."));
      const savedAsLab = !isEdit && form.kategori === "LAB";
      showToastSafe({
        title: isEdit ? "Tedarikçi güncellendi" : savedAsLab ? "Laboratuvar eklendi" : "Tedarikçi eklendi",
        message: isEdit ? name : savedAsLab ? `${name} lab işlerinde seçilebilir.` : `${name} listede. Alış için “Yeni satın alma”yı kullanın.`,
        type: "success",
        icon: "firma",
      });
      onClose();
      await onSaved({ id: String(body?.id || firma?.id || ""), name, kategori: form.kategori });
    } catch (error) {
      // Hata form içinde kalır; girilen bilgiler korunur.
      setFormError(error instanceof Error ? error.message : NETWORK_ERROR);
    } finally {
      setSaving(false);
    }
  };

  const ibanDigits = compactIban(form.iban).length;

  return (
    <FormModal
      open={open}
      onClose={onClose}
      module="firma"
      title={isEdit ? "Tedarikçiyi düzenle" : isNewLab ? "Yeni laboratuvar" : "Yeni tedarikçi"}
      onSubmit={() => submit()}
      submitting={saving}
      error={formError}
    >
      <FormField label={isNewLab ? "Laboratuvar adı" : "Firma adı"} htmlFor="firma-name" required error={errors.name}>
        <Input id="firma-name" value={form.name} onChange={(event) => set("name", event.target.value)} data-autofocus placeholder={isNewLab ? "Ör. Deneme Dental Lab" : undefined} />
      </FormField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Türü" htmlFor="firma-kategori" required>
          <Select id="firma-kategori" value={form.kategori} onChange={(event) => set("kategori", event.target.value)}>
            {Object.entries(FIRMA_KATEGORILERI).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
        </FormField>
        <FormField label="Telefon" htmlFor="firma-phone">
          <Input id="firma-phone" type="tel" inputMode="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} placeholder="0212 555 11 22" />
        </FormField>
      </div>
      <Disclosure
        title="Diğer bilgiler"
        summary="IBAN, hesap sahibi, not"
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="IBAN" htmlFor="firma-iban" error={errors.iban} hint={!errors.iban && ibanDigits > 0 && ibanDigits < 26 ? `${ibanDigits}/26 karakter` : "Ödeme yaparken kopyalamak için."}>
              <Input
                id="firma-iban"
                value={form.iban}
                onChange={(event) => set("iban", event.target.value.toUpperCase())}
                onBlur={() => { if (form.iban.trim() && !ibanError(form.iban)) set("iban", formatIban(form.iban)); }}
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                className="font-mono"
                autoComplete="off"
              />
            </FormField>
            <FormField label="Hesap sahibi" htmlFor="firma-iban-name">
              <Input id="firma-iban-name" value={form.ibanName} onChange={(event) => set("ibanName", event.target.value)} />
            </FormField>
          </div>
          <FormField label="Not" htmlFor="firma-notes">
            <Textarea id="firma-notes" value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={2} placeholder="Ör. Pazartesi ve perşembe teslimat" />
          </FormField>
        </div>
      </Disclosure>
    </FormModal>
  );
}
