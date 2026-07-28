// Next.js bu dosyayı sunucu sürecinin en başında, ilk istekten önce bir kez
// çalıştırır (bkz. https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation).
// Otomatik fatura hatırlatma zamanlayıcısını burada başlatıyoruz — ayrı bir
// cron servisi/altyapısı gerekmeden, uygulamayla aynı sürekli çalışan süreçte.
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs"
    && process.env.ENABLE_IN_PROCESS_SCHEDULER === "true"
  ) {
    const { startBillingReminderScheduler } = await import("@/lib/scheduler");
    startBillingReminderScheduler();
  }
}
