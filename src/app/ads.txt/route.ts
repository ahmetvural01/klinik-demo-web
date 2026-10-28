import { adsTxtLine, isValidPublisherId } from "@/lib/panel-ads";
import { getPlatformAdConfig } from "@/lib/panel-ads-server";

// Google AdSense yetkili satıcı dosyası. Yayıncı kimliği Süperadmin ›
// Reklamlar'da kaydedilince kendiliğinden yayınlanır (reklamlar kapalıyken de:
// Google site onayında bu dosyayı arar). Kimlik yoksa 404.
export const dynamic = "force-dynamic";

const TEXT_HEADERS = { "Content-Type": "text/plain; charset=utf-8" };

export async function GET() {
  let publisherId = "";
  try {
    publisherId = (await getPlatformAdConfig()).publisherId;
  } catch {
    // Geçici veritabanı hatası: "dosya yok" (404) yerine "sonra yeniden dene".
    return new Response("Geçici olarak yanıt verilemiyor.\n", { status: 503, headers: { ...TEXT_HEADERS, "Cache-Control": "no-store", "Retry-After": "300" } });
  }
  if (!isValidPublisherId(publisherId)) {
    return new Response("Bulunamadı.\n", { status: 404, headers: { ...TEXT_HEADERS, "Cache-Control": "no-store" } });
  }
  return new Response(`${adsTxtLine(publisherId)}\n`, { headers: { ...TEXT_HEADERS, "Cache-Control": "public, max-age=300" } });
}
