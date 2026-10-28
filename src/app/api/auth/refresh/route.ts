import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { refreshIdleSession } from "@/lib/auth";

/**
 * Kullanıcı panelde işlem yaptıkça (en çok 10 dakikada bir) çağrılır:
 * "Oturumu açık tut" işaretsiz oturumun 2 saatlik süresini yeniden başlatır.
 * Arka plan yenilemeleri (bildirim sayaçları vb.) bunu çağırmaz; böylece
 * kimse ekrana dokunmazsa oturum 2 saat sonra kendiliğinden kapanır.
 */
export async function POST() {
  // Kullanıcı hâlâ aktif ve oturumu iptal edilmemiş mi (tokenVersion) — aynı kontrol.
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const refreshed = await refreshIdleSession();
  return NextResponse.json({ ok: true, refreshed });
}
