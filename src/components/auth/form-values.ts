/**
 * Giriş formlarının değerlerini React durumundan DEĞİL formun kendisinden okur.
 *
 * Neden: sayfa hidrasyonu bitmeden yazılan ya da tarayıcının otomatik
 * doldurduğu değerler DOM'da durur ama React'in onChange'i hiç çalışmaz;
 * durum boş kalır. Önceden gönderim durumdan yapıldığı için form boş gidiyor,
 * sunucu "Geçersiz giriş verisi" diyor ve ilk yeniden çizimde React denetimli
 * alanları boş duruma eşitleyip yazılanları siliyordu (canlıda doğrulandı).
 */
export function readFormText(form: HTMLFormElement | null, name: string): string {
  if (!form) return "";
  const value = new FormData(form).get(name);
  return typeof value === "string" ? value : "";
}

/** TC kimlik no alanının tek kuralı: yalnız rakam, en fazla 11 hane. */
export function normalizeIdentityNo(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}

/**
 * Hidrasyondan sonra kullanıcı başka yere tıklamadıysa odağı ilk boş alana
 * verir. Hidrasyon öncesi yazmaya başlamış kullanıcının odağı çalınmaz.
 */
export function focusFirstEmpty(fields: Array<HTMLInputElement | null>) {
  const active = document.activeElement;
  if (active && active !== document.body) return;
  const target = fields.find((field) => field && !field.value) ?? fields[fields.length - 1];
  target?.focus();
}
