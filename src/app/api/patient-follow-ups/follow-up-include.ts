import type { Prisma } from "@prisma/client";

// Hasta Takip ekranının bir takip kaydı için beklediği TEK yanıt biçimi.
// Önceden liste (GET), oluşturma (POST) ve güncelleme (PUT) farklı alanlar
// döndürüyordu: güncellemeden sonra satırdaki laboratuvar adı ve son görüşme
// bilgisi kayboluyordu. Üç uç da bunu kullanır.
export const FOLLOW_UP_INCLUDE = {
  patient: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      phoneCountryCode: true,
      whatsappOptInAt: true,
      whatsappOptOutAt: true,
    },
  },
  appointment: {
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      doctor: { select: { id: true, fullName: true } },
    },
  },
  assignedDoctor: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  labOrder: { select: { id: true, labName: true, labType: true } },
  // Listede "Son görüşme": en son kaydedilen görüşmenin tarihi ve özeti.
  events: {
    where: { voidedAt: null },
    select: { id: true, occurredAt: true, summary: true, channel: true },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 1,
  },
} satisfies Prisma.PatientFollowUpInclude;

/** Telefon görme yetkisi olmayan rolde hasta telefonu yanıttan çıkarılır. */
export function maskFollowUpPhone<T extends { patient?: { phone?: string | null } | null }>(item: T, hidePhone: boolean): T {
  if (!hidePhone || !item.patient) return item;
  return { ...item, patient: { ...item.patient, phone: null } };
}
