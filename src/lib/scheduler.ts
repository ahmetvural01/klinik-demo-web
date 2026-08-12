/* eslint-disable no-console -- Scheduler lifecycle logs are intentional server diagnostics. */
import { runDueInvoiceReminderSweep } from "@/lib/billing-reminders";
import { runPatientPaymentReminderSweep } from "@/lib/patient-payment-reminders";
import { runBirthdaySmsSweep } from "@/lib/birthday-reminders";
import { runCelebrationDaySmsSweep } from "@/lib/celebration-sms";
import { runAppointmentReminderSweep } from "@/lib/appointment-reminders";
import { withDistributedLease } from "@/lib/security-store";

// Render'da tek, sürekli çalışan bir Node süreci olarak barındırıyoruz
// (next start, custom sunucu değil) — bu yüzden ayrı bir cron servisi
// olmadan da sunucu içi bir zamanlayıcı güvenle çalışır. Next.js dev modunda
// hot-reload sırasında bu modül birden fazla kez import edilebileceğinden,
// zamanlayıcının iki kere başlamaması için globalThis üzerinde işaretleniyor.
const FLAG = Symbol.for("klinik.scheduler.started");
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // saatte bir
const APPOINTMENT_SWEEP_INTERVAL_MS = 60 * 1000;
const FIRST_RUN_DELAY_MS = 30 * 1000; // sunucu ayağa kalkarken DB bağlantısına zaman tanı

type GlobalWithFlag = typeof globalThis & { [FLAG]?: boolean };

async function runBillingSweepSafely() {
  try {
    const lease = await withDistributedLease("scheduler:billing", 55 * 60_000, runDueInvoiceReminderSweep);
    if (!lease.acquired || !lease.value) return;
    const result = lease.value;
    if (result.checked > 0) {
      console.log(
        `[scheduler] Fatura hatırlatma taraması: ${result.checked} fatura kontrol edildi, ${result.sent} e-posta gönderildi, ${result.failed} başarısız, ${result.skippedRecent} yakın zamanda hatırlatıldığı için atlandı.`
      );
    }
  } catch (error) {
    console.error("[scheduler] Fatura hatırlatma taraması başarısız:", error);
  }
}

async function runPatientReminderSweepSafely() {
  try {
    const lease = await withDistributedLease("scheduler:patient-payment", 55 * 60_000, runPatientPaymentReminderSweep);
    if (!lease.acquired || !lease.value) return;
    const result = lease.value;
    if (result.checked > 0) {
      console.log(
        `[scheduler] Hasta taksit hatırlatma taraması: ${result.institutionsChecked} kurum, ${result.checked} taksit kontrol edildi, ${result.sent} SMS gönderildi, ${result.failed} başarısız, ${result.skippedRecent} yakın zamanda hatırlatıldı, ${result.skippedNoBalance} SMS bakiyesi yetersiz.`
      );
    }
  } catch (error) {
    console.error("[scheduler] Hasta taksit hatırlatma taraması başarısız:", error);
  }
}

async function runBirthdaySweepSafely() {
  try {
    const lease = await withDistributedLease("scheduler:birthday", 55 * 60_000, runBirthdaySmsSweep);
    if (!lease.acquired || !lease.value) return;
    const result = lease.value;
    if (result.checked > 0) {
      console.log(
        `[scheduler] Doğum günü SMS taraması: ${result.institutionsChecked} kurum, ${result.checked} hasta kontrol edildi, ${result.sent} SMS gönderildi, ${result.failed} başarısız, ${result.skippedAlreadySent} bu yıl zaten gönderilmiş, ${result.skippedNoBalance} SMS bakiyesi yetersiz.`
      );
    }
  } catch (error) {
    console.error("[scheduler] Doğum günü SMS taraması başarısız:", error);
  }
}

async function runCelebrationDaySweepSafely() {
  try {
    const lease = await withDistributedLease("scheduler:celebration", 55 * 60_000, runCelebrationDaySmsSweep);
    if (!lease.acquired || !lease.value) return;
    const result = lease.value;
    if (result.checked > 0) {
      console.log(
        `[scheduler] Kutlama günü SMS taraması: ${result.daysChecked} gün, ${result.institutionsChecked} kurum, ${result.checked} hasta kontrol edildi, ${result.sent} SMS gönderildi, ${result.failed} başarısız, ${result.skippedAlreadySent} bu yıl zaten gönderilmiş, ${result.skippedNoBalance} SMS bakiyesi yetersiz.`
      );
    }
  } catch (error) {
    console.error("[scheduler] Kutlama günü SMS taraması başarısız:", error);
  }
}

async function runAppointmentSweepSafely() {
  try {
    const lease = await withDistributedLease("scheduler:appointment", 55_000, runAppointmentReminderSweep);
    if (!lease.acquired || !lease.value) return;
    const result = lease.value;
    if (result.processed > 0) {
      console.log(
        `[scheduler] Randevu hatırlatmaları: ${result.processed} kayıt işlendi, ${result.sentWhatsapp} WhatsApp, ${result.sentSms} SMS gönderildi, ${result.failed} başarısız.`,
      );
    }
  } catch (error) {
    console.error("[scheduler] Randevu hatırlatma taraması başarısız:", error);
  }
}

export function startBillingReminderScheduler() {
  const g = globalThis as GlobalWithFlag;
  if (g[FLAG]) return;
  g[FLAG] = true;

  setTimeout(() => {
    void runAppointmentSweepSafely();
    void runBillingSweepSafely();
    void runPatientReminderSweepSafely();
    void runBirthdaySweepSafely();
    void runCelebrationDaySweepSafely();
    setInterval(() => {
      void runBillingSweepSafely();
      void runPatientReminderSweepSafely();
      void runBirthdaySweepSafely();
      void runCelebrationDaySweepSafely();
    }, SWEEP_INTERVAL_MS);
    setInterval(() => {
      void runAppointmentSweepSafely();
    }, APPOINTMENT_SWEEP_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS);

  console.log("[scheduler] Randevu, fatura, taksit, doğum günü ve kutlama günü zamanlayıcıları başlatıldı.");
}
/* eslint-disable no-console -- Scheduler lifecycle logs are intentional server diagnostics. */
