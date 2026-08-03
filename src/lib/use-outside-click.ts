import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Dropdown/popover/searchable-select gibi "açık üzerine tıklanınca kapanan"
 * bileşenler için TEK ortak dış-tıklama sözleşmesi. Önceden her bileşen
 * (topbar bildirim/uyarı popover'ları, sidebar rol seçici, PhoneCountrySelect,
 * hasta detay aksiyon menüleri) kendi mousedown/pointerdown dinleyicisini
 * ayrı ayrı yazıyordu — bazıları `mousedown`, bazıları `pointerdown`
 * kullanıyordu, davranış hissi (özellikle dokunmatik ekranda) tutarsızdı.
 * `pointerdown` fare/dokunma/kalem için tek, erken tetiklenen olay olduğundan
 * standart olarak seçildi.
 *
 * Portal ile (document.body'ye) render edilen içerik (ör. bir tarih seçici,
 * dropdown paneli) DOM ağacında ref'in ÇOCUĞU olmayabilir — bu yüzden
 * `data-outside-click-ignore` özniteliğine sahip en yakın atayı da "içeride"
 * sayan bir "escape hatch" desteklenir (bkz. PhoneCountrySelect'teki
 * data-phone-country-picker deseninin genellemesi).
 */
export function useOutsideClick(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  active: boolean = true,
) {
  useEffect(() => {
    if (!active) return;
    const handler = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (ref.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-outside-click-ignore]")) return;
      onOutside();
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ref]);
}

/**
 * Birden fazla bağımsız ref'in her biri kendi dışına tıklanınca kendi
 * kapatma fonksiyonunu çağırması gereken durumlar için (ör. topbar'daki
 * arama/uyarı/bildirim popover'ları — aynı anda birden fazlası açık
 * olabilir, her biri yalnızca KENDİ alanının dışına tıklanınca kapanmalı).
 */
export function useOutsideClickGroup(
  entries: Array<{ ref: RefObject<HTMLElement | null>; onOutside: () => void }>,
  active: boolean = true,
) {
  useEffect(() => {
    if (!active) return;
    const handler = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && target.closest("[data-outside-click-ignore]")) return;
      for (const entry of entries) {
        if (!entry.ref.current?.contains(target)) entry.onOutside();
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
