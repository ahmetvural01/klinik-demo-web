import { prisma } from "@/lib/prisma";
import { formatAppointmentDateTime } from "@/lib/appointment-change-notify";

/**
 * Hastaya yeni randevu verildiğinde açık "geri ara / ulaşılamadı / dönüş
 * bekleniyor" aramalarını kapatır. Önceden randevu takvimden verilince arama
 * Aramalar ve görevler > Hasta aramaları'nda açık kalıyor, banko aynı hastayı
 * boşuna arıyordu. Laboratuvara bağlı aramalar (prova/teslim) ve "Diğer"
 * nedenli aramalar randevuyla çözülmediği için açık kalır. Her kapanan aramaya
 * "Randevu verildi" kaydı düşülür (arama geçmişinde görünür).
 *
 * Randevu kaydını bozmaması için ayrı ve hata yutan bir adımdır.
 */
export async function closeFollowUpsResolvedByAppointment(input: {
  institutionId: string;
  branchId: string;
  patientId: string;
  actorUserId: string;
  appointmentStartAt: Date;
  doctorName?: string | null;
}) {
  try {
    const open = await prisma.patientFollowUp.findMany({
      where: {
        institutionId: input.institutionId,
        branchId: input.branchId,
        patientId: input.patientId,
        status: "ACIK",
        labOrderId: null,
        labTripId: null,
        type: { in: ["GERI_ARA", "ULASILAMADI", "DONUS_BEKLENIYOR"] },
      },
      select: { id: true, institutionId: true, branchId: true, patientId: true, createdById: true },
    });
    if (open.length === 0) return 0;

    const actor = await prisma.user.findUnique({ where: { id: input.actorUserId }, select: { id: true } });
    const now = new Date();
    const summary = `Randevu verildi: ${formatAppointmentDateTime(input.appointmentStartAt)}${input.doctorName ? ` · ${input.doctorName}` : ""}`;

    await prisma.$transaction(open.flatMap((followUp) => {
      const actorId = actor?.id || followUp.createdById;
      return [
        prisma.patientFollowUpEvent.create({
          data: {
            institutionId: followUp.institutionId,
            branchId: followUp.branchId,
            followUpId: followUp.id,
            patientId: followUp.patientId,
            occurredAt: now,
            summary,
            createdById: actorId,
            updatedById: actorId,
          },
        }),
        prisma.patientFollowUp.update({
          where: { id_institutionId_branchId: { id: followUp.id, institutionId: followUp.institutionId, branchId: followUp.branchId } },
          data: { status: "KAPALI", closedAt: now, nextActionAt: null, lastContactAt: now, resolutionNote: summary },
        }),
      ];
    }));
    return open.length;
  } catch (error) {
    console.error("[follow-up-auto-close]", error);
    return 0;
  }
}
