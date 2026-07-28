/* eslint-disable no-console */
import { isSmsQueueConfigured, runSmsWorker } from "@/lib/sms-jobs";
import { startBillingReminderScheduler } from "@/lib/scheduler";

async function main() {
  console.log("Bildirim worker basladi...");
  if (process.env.ENABLE_IN_PROCESS_SCHEDULER === "true") {
    startBillingReminderScheduler();
  }
  if (isSmsQueueConfigured()) {
    await runSmsWorker();
  }
  console.warn(
    process.env.ENABLE_IN_PROCESS_SCHEDULER === "true"
      ? "REDIS_URL tanımlı değil; toplu SMS kuyruğu kapalı, zamanlanmış işler çalışmaya devam ediyor."
      : "REDIS_URL tanımlı değil; bu worker için toplu SMS kuyruğu ve zamanlanmış işler kapalı.",
  );
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("SMS worker hata:", err);
  process.exit(1);
});
