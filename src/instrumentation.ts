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

  // Kliniklerin QR ile bağladığı WhatsApp numaraları (bağlı cihaz) sunucu
  // açılınca kayıtlı oturumlarla yeniden bağlanır. Açılışı bekletmez; hata
  // olursa yalnız günlüğe yazılır, mesajlar SMS'e düşer.
  // Kapatmak için: ENABLE_WHATSAPP_WEB=false
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ENABLE_WHATSAPP_WEB !== "false") {
    try {
      const { bootAll } = await import("@/lib/whatsapp-web");
      void bootAll();
    } catch (error) {
      console.error(
        "[whatsapp-web] Açılışta WhatsApp bağlantıları başlatılamadı:",
        error instanceof Error ? error.message : "bilinmeyen hata",
      );
    }
  }
}
