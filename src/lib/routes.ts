// Modüller arası bağlantıların TEK kaynağı. Önceden her ekran bağlantıyı elle
// yazıyordu; bazıları hasta/randevu bağlamını taşımıyordu (ör. Hasta Takip'ten
// "Randevuya Git" hastayı forma taşımıyor, kullanıcı aynı hastayı tekrar
// arıyordu). Yeni bir bağlantı gerekiyorsa buraya eklenir.

type Query = Record<string, string | number | null | undefined>;

function withQuery(path: string, query: Query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

export const routes = {
  /** Hasta dosyası; isteğe bağlı sekme (bilgi, randevular, tedavi, odeme, lab, belgeler...). */
  patient: (patientId: string, tab?: string) => withQuery("/hasta-detay", { id: patientId, tab }),
  /** Hasta listesi; isteğe bağlı arama metni. */
  patients: (q?: string) => withQuery("/hasta", { q }),
  /**
   * Yeni randevu formu. Hasta verilirse form o hasta seçili açılır (ad
   * verilmezse randevu ekranı adı kendisi yükler); tarih "YYYY-AA-GG".
   */
  newAppointment: (options: { patientId?: string; patientName?: string; date?: string; doctorId?: string } = {}) =>
    withQuery("/randevu", { yeni: 1, patientId: options.patientId, patientName: options.patientName, date: options.date, doctorId: options.doctorId }),
  /** Takvimde belirli bir randevuyu göster (gün görünümü, randevu vurgulu). */
  appointment: (appointmentId: string, date?: string) => withQuery("/randevu", { focusAppointmentId: appointmentId, date, view: "GUN" }),
  /** Yeni lab işi formu; hasta verilirse seçili açılır. */
  newLabOrder: (patientId?: string) => withQuery("/lab", { yeni: 1, patientId }),
  /** Yeni görev formu. */
  newTask: () => withQuery("/gorevler", { yeni: 1 }),
  /** Tahsilat (gelir) formu. */
  newCollection: () => withQuery("/muhasebe", { islem: "gelir" }),
} as const;
