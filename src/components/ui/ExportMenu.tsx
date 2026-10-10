"use client";

import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Button } from "@/components/ui/Button";
import { showToastSafe } from "@/lib/toast-client";

type IconComponent = ComponentType<{ className?: string }>;

export type ExportMenuItem = {
  key: string;
  /** Biçim adı: "Excel (CSV)", "PDF", "Oda listesi (PDF)". */
  label: string;
  /** Kısa açıklama ("Seçili dönemin tüm kayıtları"). */
  description?: string;
  icon?: IconComponent;
  /** Promise dönerse bitene kadar düğme "hazırlanıyor" durumunda kalır. */
  onSelect: () => unknown;
  disabled?: boolean;
  disabledReason?: string;
};

type ExportMenuProps = {
  items?: ExportMenuItem[];
  /** Kısayol (eski muhasebe/ExportMenu API'si): `items` yoksa "Excel (CSV)" öğesi üretir. */
  onExcel?: () => unknown;
  /** Kısayol: `items` yoksa "PDF" öğesi üretir. */
  onPdf?: () => unknown;
  /** Düğme adı — her yerde "Dışa aktar". */
  label?: string;
  /** Dışa aktarılacak bir şey yoksa (boş liste) pasif. */
  disabled?: boolean;
  /** Pasifken nedeni ("Dışa aktarılacak kayıt yok"); fareyle üzerine gelince görünür. */
  disabledReason?: string;
  /** Dışarıdan meşgul durumu (ör. tüm kayıtlar sunucudan çekiliyor). */
  loading?: boolean;
  size?: "sm" | "md";
  align?: "start" | "end";
  /** Sarmalayıcı sınıfı (ör. telefonda gizlemek için "hidden sm:inline-flex"). */
  className?: string;
};

/**
 * Liste araç çubuğunun sağındaki TEK "Dışa aktar" düğmesi (ortak ActionMenu
 * üzerine). Önceden iki ayrı kopya vardı (muhasebe/ExportMenu: Esc/ok tuşu
 * yok; work-lists/ExportMenu: meşgul durumu yok) ve ikisi de araç çubuğunun
 * `overflow:hidden` kutusunda kırpılabiliyordu; ActionMenu menüyü gövdeye
 * taşır. Tek biçim varsa menü açılmaz, düğme doğrudan o biçimi indirir.
 * Yetki kontrolü sayfada: `{can("finance:export") && <ExportMenu … />}`.
 *
 *   // Yalnız Excel ve PDF: kısayollar (ad ve ikon hazır gelir). Araç çubuğunda size="md".
 *   <ExportMenu onExcel={exportExcel} onPdf={exportPdf} disabled={rows.length === 0} disabledReason="Dışa aktarılacak kayıt yok" />
 *   // Üçüncü bir biçim varsa items — her öğeye ikon:
 *   <ExportMenu items={[
 *     { key: "excel", label: "Excel (CSV)", icon: FileSpreadsheet, onSelect: exportExcel },
 *     { key: "oda", label: "Oda listesi (PDF)", icon: FileText, onSelect: exportRoomList },
 *   ]} />
 *
 * onSelect içinde fırlatılan hatanın mesajı kullanıcıya gösterilir — Türkçe
 * yazın. Ağ kopukluğu gibi tarayıcı hataları (İngilizce "Failed to fetch")
 * gösterilmez; yerine Türkçe yedek metin çıkar.
 */
export function ExportMenu({ items, onExcel, onPdf, label = "Dışa aktar", disabled = false, disabledReason, loading = false, size = "sm", align = "end", className = "" }: ExportMenuProps) {
  const [busy, setBusy] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const wasWorking = useRef(false);
  const reasonId = useId();

  const list: ExportMenuItem[] = items ?? [
    ...(onExcel ? [{ key: "excel", label: "Excel (CSV)", icon: FileSpreadsheet, onSelect: onExcel }] : []),
    ...(onPdf ? [{ key: "pdf", label: "PDF", icon: FileText, onSelect: onPdf }] : []),
  ];
  const working = busy || loading;

  // Menüden seçim yapılınca odak kapanan menüyle kaybolur (meşgul düğme de
  // pasiftir); iş bitince klavye kullanıcısı kaldığı yere (düğmeye) dönsün.
  useEffect(() => {
    if (wasWorking.current && !working) {
      const active = document.activeElement;
      if (!active || active === document.body) wrapperRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
    wasWorking.current = working;
  }, [working]);

  const run = async (item: ExportMenuItem) => {
    if (working || item.disabled) return;
    try {
      const result = item.onSelect();
      // Yalnız Promise dönen dışa aktarım (sunucudan tüm kayıtları çekme, PDF üretme) meşgul gösterilir.
      if (!result || typeof (result as PromiseLike<unknown>).then !== "function") return;
      setBusy(true);
      await result;
    } catch (error) {
      // fetch'in TypeError'ı ("Failed to fetch") ve iptal (AbortError) tarayıcının
      // İngilizce mesajıdır; yalnız sayfanın bilerek fırlattığı mesaj gösterilir (§3).
      const ownMessage = error instanceof Error && error.message && !(error instanceof TypeError) && error.name !== "AbortError";
      showToastSafe({ type: "error", message: ownMessage ? (error as Error).message : "Dışa aktarılamadı. Yeniden deneyin." });
    } finally {
      setBusy(false);
    }
  };

  if (list.length === 0) return null;

  const single = list.length === 1 ? list[0] : null;
  const inactive = disabled || list.every((item) => item.disabled);
  const reason = disabled ? disabledReason : inactive ? list.find((item) => item.disabledReason)?.disabledReason : undefined;

  // Pasif, meşgul ya da tek biçimli durumda menü açılmaz; aynı ölçüde düz düğme görünür.
  const control = inactive || working || single ? (
    <Button
      variant="secondary"
      size={size}
      icon={single?.icon || Download}
      loading={working}
      disabled={inactive || working}
      aria-label={single && !working ? `${label}: ${single.label}` : undefined}
      aria-describedby={inactive && !working && reason ? reasonId : undefined}
      title={single && !working && !inactive ? single.description || single.label : undefined}
      onClick={single ? () => void run(single) : undefined}
    >
      {label}
      {!single && <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />}
    </Button>
  ) : (
    <ActionMenu
      trigger="button"
      label={label}
      icon={Download}
      size={size}
      align={align}
      items={list.map((item): ActionMenuItem => ({
        key: item.key,
        label: item.label,
        description: item.description,
        icon: item.icon,
        disabled: item.disabled,
        disabledReason: item.disabledReason,
        onSelect: () => void run(item),
      }))}
    />
  );

  return (
    // Pasif düğme fare olaylarını almaz; neden sarmalayıcıda title olarak görünür.
    <span ref={wrapperRef} className={`inline-flex ${className}`} title={inactive && !working ? reason : undefined}>
      {control}
      {/* Pasif düğmenin nedeni ekran okuyucuya da söylensin (title yalnız fareyle görünür). */}
      {inactive && !working && reason && <span id={reasonId} className="sr-only">{reason}</span>}
      <span className="sr-only" aria-live="polite">{working ? "Dışa aktarım hazırlanıyor" : ""}</span>
    </span>
  );
}
