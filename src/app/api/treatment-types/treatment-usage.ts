// Randevu notunda tedavi türü "Tedavi: DEĞER" satırıyla tutulur (bkz.
// lib/appointment-follow-up buildAppointmentNote). Satırın sonu satır sonu
// ya da notun sonudur; böylece IMPLANT araması IMPLANT_2'yi saymaz.
export function treatmentNoteMatch(value: string) {
  return [
    { note: { contains: `Tedavi: ${value}\n` } },
    { note: { endsWith: `Tedavi: ${value}` } },
  ];
}
