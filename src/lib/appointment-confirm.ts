import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeInstitution } from "@/lib/realtime-bus";
import { getClinicDisplayInfo } from "@/lib/clinic-display-name";
import { formatAppointmentDateTime } from "@/lib/appointment-change-notify";

// Hatırlatma mesajındaki onay bağlantısı: hasta "Geleceğim" ya da
// "Gelemeyeceğim" der. Gelemeyecekse randevu iptal edilir (saat boşalır) ve
// kliniğe "yeni randevu için ara" takibi açılır; klinik ayrıca bir şey
// yapmadan hasta kaybolmaz. Bağlantı randevu saatine kadar geçerlidir.

export type PatientResponse = "GELECEK" | "GELEMEYECEK";

/** Bağlantı adresi; APP_URL tanımlı değilse (yerel kurulum) bağlantı eklenmez. */
export function appointmentConfirmUrl(token: string) {
  const base = (process.env.APP_URL || "").replace(/\/$/, "");
  return base ? `${base}/r/${token}` : null;
}

/** Randevunun onay belirtecini döner; yoksa oluşturur (aynı randevuya tek belirteç). */
export async function ensureAppointmentConfirmToken(appointmentId: string, current: string | null) {
  if (current) return current;
  const token = randomBytes(9).toString("base64url");
  await prisma.appointment.updateMany({ where: { id: appointmentId, confirmToken: null }, data: { confirmToken: token } });
  const saved = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { confirmToken: true } });
  return saved?.confirmToken ?? null;
}

export type ConfirmPageState =
  | { ok: false; reason: "NOT_FOUND" }
  | {
      ok: true;
      clinic: { name: string; phone: string | null; logoUrl: string | null };
      dateText: string;
      doctorName: string;
      /** Yanıt verilebilir mi (iptal/geçmiş/gelinmiş randevuda hayır). */
      open: boolean;
      closedReason: "CANCELLED" | "PAST" | "DONE" | null;
      response: PatientResponse | null;
    };

async function findByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return null;
  return prisma.appointment.findUnique({
    where: { confirmToken: token },
    select: {
      id: true,
      institutionId: true,
      branchId: true,
      patientId: true,
      doctorId: true,
      startAt: true,
      status: true,
      patientResponse: true,
      doctor: { select: { fullName: true } },
      institution: { select: { isActive: true } },
    },
  });
}

function closedReason(appointment: { status: string; startAt: Date }, now = new Date()): "CANCELLED" | "PAST" | "DONE" | null {
  if (appointment.status === "IPTAL") return "CANCELLED";
  if (["GELDI", "TAMAMLANDI", "GELMEDI"].includes(appointment.status)) return "DONE";
  if (appointment.startAt.getTime() <= now.getTime()) return "PAST";
  return null;
}

export async function getConfirmPageState(token: string): Promise<ConfirmPageState> {
  const appointment = await findByToken(token);
  if (!appointment || !appointment.institution.isActive) return { ok: false, reason: "NOT_FOUND" };
  const clinic = await getClinicDisplayInfo(appointment.institutionId);
  const reason = closedReason(appointment);
  return {
    ok: true,
    clinic: { name: clinic?.name || "", phone: clinic?.phone || null, logoUrl: clinic?.logoUrl || null },
    dateText: formatAppointmentDateTime(appointment.startAt),
    doctorName: appointment.doctor.fullName,
    open: reason === null,
    closedReason: reason,
    response: appointment.patientResponse,
  };
}

/**
 * Hastanın yanıtını kaydeder. "Gelemeyeceğim": randevu iptal edilir ve
 * randevunun doktoruna atanmış, hemen aranacak bir takip açılır. Aynı yanıt
 * tekrar gönderilirse bir şey değişmez; iptal edilen randevu geri açılmaz.
 */
export async function recordPatientResponse(token: string, response: PatientResponse) {
  const appointment = await findByToken(token);
  if (!appointment || !appointment.institution.isActive) return { ok: false as const, status: 404, message: "Bu bağlantı geçersiz." };
  const reason = closedReason(appointment);
  if (reason) {
    const message = reason === "CANCELLED"
      ? "Bu randevu iptal edilmiş."
      : reason === "PAST" ? "Randevu saati geçtiği için yanıt alınamıyor." : "Bu randevu için yanıt artık gerekmiyor.";
    return { ok: false as const, status: 410, message };
  }
  if (appointment.patientResponse === response) return { ok: true as const, response };

  const now = new Date();
  if (response === "GELECEK") {
    await prisma.appointment.updateMany({
      where: { id: appointment.id, status: appointment.status },
      data: { patientResponse: "GELECEK", patientRespondedAt: now },
    });
  } else {
    await prisma.$transaction(async (tx) => {
      const cancelled = await tx.appointment.updateMany({
        where: { id: appointment.id, status: appointment.status },
        data: { patientResponse: "GELEMEYECEK", patientRespondedAt: now, status: "IPTAL" },
      });
      if (cancelled.count === 0) return;
      await tx.patientFollowUp.create({
        data: {
          institutionId: appointment.institutionId,
          branchId: appointment.branchId,
          patientId: appointment.patientId,
          appointmentId: appointment.id,
          doctorId: appointment.doctorId,
          createdById: appointment.doctorId,
          type: "GERI_ARA",
          priority: 1,
          note: `Hasta, ${formatAppointmentDateTime(appointment.startAt)} randevusuna gelemeyeceğini mesajdaki bağlantıdan bildirdi; randevu iptal edildi. Yeni randevu için arayın.`,
          nextActionAt: now,
        },
      });
    });
  }
  await bumpRealtimeInstitution(appointment.institutionId).catch(() => undefined);
  return { ok: true as const, response };
}
