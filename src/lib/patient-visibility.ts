// DOKTOR ve ASISTAN rolleri hasta telefonunu göremez. Bu kural önceden 5 ayrı
// dosyada birebir aynı satırla tekrar ediliyordu (bkz. denetim raporu Tema 2) —
// politika değişirse tek yer güncellenir.
/**
 * @deprecated Kullanılmıyor ve eskimiş: telefon/TC görme artık rol yetki
 * matrisindeki `patients:phone` izni + kişiye özel şube kısıtıyla belirlenir.
 * Sunucuda `shouldHidePatientPhoneForUser` (src/lib/patient-visibility-server.ts),
 * istemcide `can("patients:phone")` kullanın. Dosya geriye uyumluluk için duruyor.
 */
export function shouldHidePatientPhone(role: string | null | undefined): boolean {
  return role === "DOKTOR" || role === "ASISTAN";
}
