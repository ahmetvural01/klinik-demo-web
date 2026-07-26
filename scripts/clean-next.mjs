import { rm } from "node:fs/promises";
import path from "node:path";

for (const directory of [".next", ".next-dev"]) {
  const target = path.join(process.cwd(), directory);
  try {
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch (error) {
    console.warn(`${directory} temizlenemedi, build devam edecek:`, error);
  }
}
