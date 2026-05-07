import { rm } from "node:fs/promises";
import path from "node:path";

const nextDir = path.join(process.cwd(), ".next");

try {
  await rm(nextDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
} catch (error) {
  console.warn(".next temizlenemedi, build devam edecek:", error);
}