import { NextRequest, NextResponse } from "next/server";
import { hasEffectivePermission, requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  connect,
  disconnect,
  ensureBooted,
  getStatus,
  sendSelfTest,
  WhatsappWebError,
  type WhatsappWebStatus,
  type WhatsappWebStatusResponse,
} from "@/lib/whatsapp-web";
import { maskPhoneDigits, normalizePairingPhone } from "@/lib/whatsapp-web/phone";

// Baileys yalnız Node çalışma ortamında çalışır.
export const runtime = "nodejs";

/**
 * Kliniğin kendi WhatsApp numarasını QR kod / eşleştirme koduyla "bağlı
 * cihaz" olarak bağlaması.
 *  GET    → bağlantı durumu (+QR/kod yalnız yöneticiye)
 *  POST   → { action: "connect", method: "qr" | "code", phone? } | { action: "test" }
 *  DELETE → bağlantıyı kes (telefondaki bağlı cihazlardan da çıkar)
 * Yanıtlarda oturum anahtarları/creds ASLA dönmez.
 */

async function requireClinic(permission: "whatsapp:read" | "whatsapp:write") {
  const auth = await requireAuth(permission);
  if (auth.error) return { error: auth.error };
  const institutionId = auth.user.institutionId;
  if (!institutionId) {
    return { error: NextResponse.json({ message: "Yalnız klinik kullanıcıları erişebilir." }, { status: 403 }) };
  }
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { isActive: true, whatsappEnabled: true },
  });
  if (!institution?.isActive || !institution.whatsappEnabled) {
    return {
      error: NextResponse.json(
        { message: "WhatsApp kullanımı bu klinik için açık değil; platform yöneticisine başvurun." },
        { status: 403 },
      ),
    };
  }
  return { auth, institutionId };
}

/**
 * QR'ı/kodu gören kişi kliniğin WhatsApp'ına cihaz bağlayabilir: bu yüzden
 * yalnız klinik yöneticisi (süperadmin destek oturumu dahil — ghost oturumu
 * YONETICI rolüyle açılır) yönetebilir.
 */
function isConnectionManagerRole(role: string) {
  return role === "YONETICI" || role === "SUPERADMIN";
}

function managerOnly() {
  return NextResponse.json(
    { message: "WhatsApp bağlantısını yalnız klinik yöneticisi kurabilir, test edebilir veya kesebilir." },
    { status: 403 },
  );
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof WhatsappWebError) {
    return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
  }
  console.error("[whatsapp-web] API hatası:", error instanceof Error ? error.message : "bilinmeyen hata");
  return NextResponse.json({ message: fallback }, { status: 500 });
}

function respond(status: WhatsappWebStatus, canManage: boolean): NextResponse {
  const body: WhatsappWebStatusResponse = canManage
    ? { ...status, canManage }
    : { ...status, qrDataUrl: null, pairingCode: null, canManage };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const clinic = await requireClinic("whatsapp:read");
  if ("error" in clinic) return clinic.error;
  const { auth, institutionId } = clinic;
  // Sunucu instrumentation olmadan başladıysa kayıtlı oturumlar burada devreye alınır.
  ensureBooted();
  const canManage = isConnectionManagerRole(auth.user.role) && (await hasEffectivePermission(auth.user, "whatsapp:write"));
  return respond(await getStatus(institutionId), canManage);
}

export async function POST(request: NextRequest) {
  const clinic = await requireClinic("whatsapp:write");
  if ("error" in clinic) return clinic.error;
  const { auth, institutionId } = clinic;
  if (!isConnectionManagerRole(auth.user.role)) return managerOnly();

  const body = (await request.json().catch(() => null)) as { action?: unknown; method?: unknown; phone?: unknown } | null;
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "connect") {
    const method = body?.method === "code" ? "code" : body?.method === "qr" ? "qr" : null;
    if (!method) return NextResponse.json({ message: "Bağlama yöntemi geçersiz." }, { status: 400 });
    let phoneDigits: string | null = null;
    if (method === "code") {
      const normalized = normalizePairingPhone(typeof body?.phone === "string" ? body.phone : "");
      if (!normalized.ok) return NextResponse.json({ message: normalized.error }, { status: 400 });
      phoneDigits = normalized.digits;
    }
    try {
      const status = await connect(
        institutionId,
        phoneDigits ? { method: "code", phone: phoneDigits } : { method: "qr" },
        auth.user.id,
      );
      if (status.state === "QR") {
        await writeAudit(
          auth.user.id,
          "WHATSAPP_WEB_PAIRING_STARTED",
          phoneDigits
            ? `WhatsApp numara bağlama başlatıldı (telefon numarasıyla, ${maskPhoneDigits(phoneDigits)}).`
            : "WhatsApp numara bağlama başlatıldı (QR kod ile).",
        );
      }
      return respond(status, true);
    } catch (error) {
      return errorResponse(error, "WhatsApp bağlantısı başlatılamadı. Lütfen tekrar deneyin.");
    }
  }

  if (action === "test") {
    const result = await sendSelfTest(institutionId);
    await writeAudit(
      auth.user.id,
      "WHATSAPP_PROVIDER_TEST_SEND",
      `WhatsApp (QR) bağlantı testi kendi numaraya: ${result.ok ? "gönderildi" : "gönderilemedi"}.`,
    );
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.error },
        { status: result.code === "NOT_CONNECTED" ? 409 : result.code === "UNAVAILABLE" ? 503 : 422 },
      );
    }
    return NextResponse.json({ ok: true, message: "Test mesajı kendi WhatsApp numaranıza gönderildi." });
  }

  return NextResponse.json({ message: "Geçersiz işlem." }, { status: 400 });
}

export async function DELETE() {
  const clinic = await requireClinic("whatsapp:write");
  if ("error" in clinic) return clinic.error;
  const { auth, institutionId } = clinic;
  if (!isConnectionManagerRole(auth.user.role)) return managerOnly();
  try {
    const result = await disconnect(institutionId, auth.user.id);
    const status = await getStatus(institutionId);
    return NextResponse.json({ ...status, canManage: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "WhatsApp bağlantısı kesilemedi. Lütfen tekrar deneyin.");
  }
}
