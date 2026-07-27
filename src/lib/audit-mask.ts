// Audit detail metinlerine hasta ad-soyad/telefonu düz metin olarak
// yazılmasını önlemek için kullanılır. Süperadmin denetim ekranı/CSV
// dışa aktarımı tüm kliniklerin kayıtlarını tek yerde topladığından,
// düz metin PII orada başka bir kliniğin superadmin'ine de görünür
// oluyordu (KVKK riski) — bu yüzden kaynakta (writeAudit çağrısından
// önce) maskeleniyor.
export function maskPatientPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-2)}`;
}

export function maskPatientName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "***";
  const first = parts[0];
  if (parts.length === 1) return `${first.slice(0, 1)}***`;
  return `${first} ${parts[parts.length - 1].slice(0, 1)}.`;
}
