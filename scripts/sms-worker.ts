/* eslint-disable no-console */
import { runSmsWorker } from "@/lib/sms-jobs";

async function main() {
  console.log("SMS worker basladi...");
  await runSmsWorker();
}

main().catch((err) => {
  console.error("SMS worker hata:", err);
  process.exit(1);
});
