import { rm } from "node:fs/promises";
import path from "node:path";

// Üretim derlemesi çalışan `next dev` sürecinin kullandığı `.next-dev`
// klasörüne dokunmamalı. Aksi halde geliştirme sunucusu açıkken build almak
// routes-manifest/runtime dosyalarını silip yerelde rastgele 500 hatalarına
// yol açar. `.next-dev` temizliği yalnızca dev-stable kapalıyken yapılır.
for (const directory of [".next"]) {
  const target = path.join(process.cwd(), directory);
  try {
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch (error) {
    console.warn(`${directory} temizlenemedi, build devam edecek:`, error);
  }
}
