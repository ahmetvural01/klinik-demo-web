// DOKTOR ve ASISTAN rolleri hasta telefonunu göremez. Bu kural önceden 5 ayrı
// dosyada birebir aynı satırla tekrar ediliyordu (bkz. denetim raporu Tema 2) —
// politika değişirse tek yer güncellenir.
export function shouldHidePatientPhone(role: string | null | undefined): boolean {
  return role === "DOKTOR" || role === "ASISTAN";
}
