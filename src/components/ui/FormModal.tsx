"use client";

import { useEffect, useId, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { FormErrorBanner } from "@/components/ui/FormField";
import { Modal, useModalClose, type ModalProps } from "@/components/ui/Modal";

export type FormModalDangerAction = {
  /** Nadir/tehlikeli eylem ("Arşivle", "Planı iptal et") — solda, kırmızı metin. */
  label: string;
  onClick: () => void;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
  loading?: boolean;
};

export type FormModalSecondarySubmit = {
  /** Düğme metni ("Kaydet ve randevu ver"). */
  label: string;
  /**
   * Gönderimin amacı: `onSubmit` içinde `submitIntent(event)` bunu döndürür
   * (birincil düğme ve Enter ile gönderimde null).
   */
  intent: string;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
};

/**
 * Formu hangi düğmenin gönderdiğini söyler: `secondarySubmit.intent` ya da
 * `data-intent` taşıyan gönder düğmesi; birincil düğme ve Enter'da null.
 */
export function submitIntent(event: FormEvent<HTMLFormElement>): string | null {
  const submitter = (event.nativeEvent as SubmitEvent).submitter;
  return submitter?.getAttribute("data-intent") || null;
}

export type FormModalProps = Omit<ModalProps, "footer" | "children"> & {
  /**
   * Gönderim (Kaydet düğmesi ya da alanlarda Enter). Varsayılan tarayıcı
   * gönderimi zaten engellenmiştir. Promise dönerse bitene kadar düğme
   * "yükleniyor" olur ve ikinci gönderim yapılmaz.
   */
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<unknown>;
  children: ReactNode;
  /** Birincil düğme metni. Varsayılan "Kaydet" (sözleşme §3). */
  submitLabel?: string;
  /** İkincil düğme metni. Varsayılan "Vazgeç". */
  cancelLabel?: string;
  /** Kaydediliyor: birincil düğme yükleniyor, Vazgeç pasif, pencere kapanmaz. */
  submitting?: boolean;
  /** Gönderilecek bir şey yoksa (ör. hiçbir alan değişmedi) birincil düğme pasif. */
  submitDisabled?: boolean;
  /**
   * Birincil düğme hiç gösterilmez ve Enter ile gönderim yapılmaz (ör. kayıt
   * bulunamadı ya da salt okunur): pasif bir "Kaydet" yerine yalnız ikincil
   * düğme ("Kapat") kalır.
   */
  hideSubmit?: boolean;
  /** Birincil eylem geri alınamazsa (ör. gerekçeli iptal) "danger". */
  submitVariant?: "primary" | "danger";
  /** Sunucu/genel hata — formun en üstünde gösterilir ve görünür alana kaydırılır. */
  error?: string | null;
  /** Alt bilgide solda nadir/tehlikeli ikincil eylem (danger-ghost düğme). */
  dangerAction?: FormModalDangerAction;
  /**
   * Formu başka amaçla gönderen ikinci düğme ("Kaydet ve randevu ver").
   * Vazgeç'in solunda durur; kayıt sürerken yalnız basılan düğme
   * "yükleniyor" görünür. Amaç `submitIntent(event)` ile okunur.
   */
  secondarySubmit?: FormModalSecondarySubmit;
  /** Alt bilgide Vazgeç'in solunda ek içerik (ör. "Yazdır" ikincil düğmesi). */
  footerExtra?: ReactNode;
  /** Formun id'si; verilmezse üretilir. */
  formId?: string;
  /** Form gövdesinin sınıfı; alanlar arası boşluk tüm formlarda aynı kalsın diye varsayılan "space-y-4". */
  formClassName?: string;
};

/**
 * "Vazgeç": pencerenin korumalı kapatmasını kullanır (kirli formda Esc ve ×
 * gibi "Değişiklikler kaybolsun mu?" diye sorar). Modal'ın içinde çizildiği
 * için bağlamı oradan okur.
 */
function CancelButton({ label, disabled, fallback }: { label: string; disabled: boolean; fallback: () => void }) {
  const guardedClose = useModalClose();
  return (
    <Button variant="secondary" onClick={() => (guardedClose ?? fallback)()} disabled={disabled}>
      {label}
    </Button>
  );
}

/**
 * Pencere içi form — TEK iskelet: <form> + Enter ile gönderim, altta
 * "Vazgeç" (ikincil) ve birincil "Kaydet", üstte hata şeridi, çift gönderim
 * ve kayıt sürerken kapatma engeli. Önceden her form penceresi bunları elle
 * kuruyordu (görünmez submit düğmesi, form id'si, saving ref'i, hata kutusu)
 * ve düğme adları/sırası ekrandan ekrana değişiyordu. Modal'ın tüm özellikleri
 * (size, module, description, isDirty, trackFormChanges, confirmOnDirtyClose)
 * aynen geçer. Kirli formda Esc, × ve "Vazgeç" önce onay sorar.
 *
 *   <FormModal open={open} onClose={close} title="Tahsilat al" module="finance"
 *     onSubmit={save} submitting={saving} error={serverError} isDirty={dirty}>
 *     <FormField label="Tutar" required htmlFor="tutar" error={errors.amount}>
 *       <MoneyInput id="tutar" value={amount} onChange={setAmount} />
 *     </FormField>
 *   </FormModal>
 */
export function FormModal({
  onSubmit,
  children,
  submitLabel = "Kaydet",
  cancelLabel = "Vazgeç",
  submitting = false,
  submitDisabled = false,
  hideSubmit = false,
  submitVariant = "primary",
  error,
  dangerAction,
  secondarySubmit,
  footerExtra,
  formId,
  formClassName = "space-y-4",
  onClose,
  closeDisabled = false,
  ...modalProps
}: FormModalProps) {
  const generatedId = useId();
  const id = formId || `form-${generatedId.replace(/:/g, "")}`;
  const [pending, setPending] = useState(false);
  // Son gönderimin amacı: kayıt sürerken yalnız basılan düğme "yükleniyor" görünsün.
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const busy = submitting || pending;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const errorRef = useRef<HTMLDivElement>(null);

  // Hata şeridi formun üstünde; kullanıcı formun altındayken çıkan hatayı görsün.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [error]);

  // Kayıt sürerken pencere kapanmaz: kapatıp yeniden açmak yeni işlem anahtarı
  // üretir ve aynı tahsilatın iki kez kaydedilmesine yol açabilirdi.
  const requestClose = () => {
    if (!busyRef.current) onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Pencere gövdeye taşınsa da React olayı üst bileşen ağacına kabarır; sayfa
    // kendi <form>'u içinde bu pencereyi açtıysa o form da gönderilmesin.
    event.stopPropagation();
    if (busyRef.current || pendingRef.current || submitDisabled || hideSubmit) return;
    const intent = submitIntent(event);
    if (secondarySubmit?.disabled && intent === secondarySubmit.intent) return;
    setLastIntent(intent);
    const result = onSubmit(event);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      pendingRef.current = true;
      setPending(true);
      const release = () => {
        pendingRef.current = false;
        setPending(false);
      };
      (result as Promise<unknown>).then(release, (reason: unknown) => {
        release();
        // Hata, çağıranın sorumluluğunda; yutulmaz, konsolda görünür kalır.
        throw reason;
      });
    }
  };

  const secondaryPressed = Boolean(secondarySubmit) && lastIntent === secondarySubmit?.intent;

  return (
    <Modal
      {...modalProps}
      onClose={requestClose}
      closeDisabled={closeDisabled || busy}
      footer={(
        <>
          {dangerAction && (
            <Button
              variant="danger-ghost"
              icon={dangerAction.icon}
              onClick={dangerAction.onClick}
              disabled={busy || dangerAction.disabled}
              loading={dangerAction.loading}
              className="mr-auto"
            >
              {dangerAction.label}
            </Button>
          )}
          {/* Sağ grup birlikte kalır: dar pencerede yalnız tehlikeli eylem üst
              satıra çıkar, "Kaydet" "Vazgeç"ten ayrı satıra düşmez. */}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {footerExtra}
            {secondarySubmit && !hideSubmit && (
              <Button
                type="submit"
                form={id}
                variant="secondary"
                icon={secondarySubmit.icon}
                data-intent={secondarySubmit.intent}
                loading={busy && secondaryPressed}
                disabled={busy || submitDisabled || secondarySubmit.disabled}
                // Telefonda kendi satırında: "Vazgeç" ile "Kaydet" yan yana kalsın.
                className="w-full sm:w-auto"
              >
                {secondarySubmit.label}
              </Button>
            )}
            <CancelButton label={cancelLabel} disabled={busy} fallback={requestClose} />
            {!hideSubmit && (
              <Button
                type="submit"
                form={id}
                variant={submitVariant}
                loading={busy && !secondaryPressed}
                disabled={submitDisabled || (busy && secondaryPressed)}
              >
                {submitLabel}
              </Button>
            )}
          </div>
        </>
      )}
    >
      <form id={id} onSubmit={handleSubmit} noValidate className={formClassName}>
        {error ? (
          <div ref={errorRef} className="scroll-mt-2">
            <FormErrorBanner message={error} />
          </div>
        ) : null}
        {children}
        {/* Enter ile gönderim: alt bilgi düğmeleri form dışında çizildiği için
            formun içinde görünmez varsayılan düğme. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
