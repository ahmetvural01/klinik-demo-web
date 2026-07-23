import { runDueInvoiceReminderSweep } from "@/lib/billing-reminders";
import { runPatientPaymentReminderSweep } from "@/lib/patient-payment-reminders";

// Render'da tek, sürekli çalışan bir Node süreci olarak barındırıyoruz
// (next start, custom sunucu değil) — bu yüzden ayrı bir cron servisi
// olmadan da sunucu içi bir zamanlayıcı güvenle çalışır. Next.js dev modunda
// hot-reload sırasında bu modül birden fazla kez import edilebileceğinden,
// zamanlayıcının iki kere başlamaması için globalThis üzerinde işaretleniyor.
const FLAG = Symbol.for("klinik.scheduler.started");
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // saatte bir
const FIRST_RUN_DELAY_MS = 30 * 1000; // sunucu ayağa kalkarken DB bağlantısına zaman tanı

type GlobalWithFlag = typeof globalThis & { [FLAG]?: boolean };

async function runBillingSweepSafely() {
  try {
    const result = await runDueInvoiceReminderSweep();
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
    const result = await runPatientPaymentReminderSweep();
    if (result.checked > 0) {
      console.log(
        `[scheduler] Hasta taksit hatırlatma taraması: ${result.institutionsChecked} kurum, ${result.checked} taksit kontrol edildi, ${result.sent} SMS gönderildi, ${result.failed} başarısız, ${result.skippedRecent} yakın zamanda hatırlatıldı, ${result.skippedNoBalance} SMS bakiyesi yetersiz.`
      );
    }
  } catch (error) {
    console.error("[scheduler] Hasta taksit hatırlatma taraması başarısız:", error);
  }
}

export function startBillingReminderScheduler() {
  const g = globalThis as GlobalWithFlag;
  if (g[FLAG]) return;
  g[FLAG] = true;

  setTimeout(() => {
    void runBillingSweepSafely();
    void runPatientReminderSweepSafely();
    setInterval(() => {
      void runBillingSweepSafely();
      void runPatientReminderSweepSafely();
    }, SWEEP_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS);

  console.log("[scheduler] Fatura ve hasta taksit hatırlatma zamanlayıcıları başlatıldı (saatte bir çalışacak).");
}
