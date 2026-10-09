import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { decryptField } from "@/lib/field-crypto";
import { getMetaWhatsappReadiness, unsubscribeMetaWaba } from "@/lib/meta-whatsapp";
import { prisma } from "@/lib/prisma";
import { findConnectedWhatsapp } from "@/lib/whatsapp-connection";

const PROVIDER_CODE = "META_EMBEDDED";

async function authorize(write = false) {
  return requireAuth(write ? "whatsapp:write" : "whatsapp:read");
}

async function moduleEnabled(institutionId: string) {
  return prisma.institution.findFirst({
    where: { id: institutionId, isActive: true },
    select: { whatsappEnabled: true },
  });
}

function canManageConnection(role: string) {
  return role === "YONETICI" || role === "SUPERADMIN";
}

export async function GET() {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json({ message: "Yalnızca klinik kullanıcıları erişebilir." }, { status: 403 });

  const institution = await moduleEnabled(institutionId);
  if (!institution?.whatsappEnabled) {
    return NextResponse.json({ message: "WhatsApp modülü bu klinik için açık değil." }, { status: 403 });
  }

  const [provider, setting] = await Promise.all([
    prisma.whatsappProviderConfig.findUnique({
      where: { institutionId_code: { institutionId, code: PROVIDER_CODE } },
      select: {
        id: true,
        isActive: true,
        connectionStatus: true,
        connectionError: true,
        displayPhoneNumber: true,
        verifiedName: true,
        tokenExpiresAt: true,
        connectedAt: true,
        disconnectedAt: true,
        lastWebhookAt: true,
        lastSuccessfulSendAt: true,
        updatedAt: true,
      },
    }),
    prisma.setting.findUnique({
      where: { institutionId },
      select: {
        defaultNotificationChannel: true,
        whatsappSmsFallback: true,
        whatsappAppointmentEnabled: true,
        whatsappPaymentEnabled: true,
        whatsappInfoEnabled: true,
      },
    }),
  ]);
  return NextResponse.json({
    enabled: true,
    platformReady: getMetaWhatsappReadiness().ready,
    canManageConnection: canManageConnection(auth.user.role),
    provider: provider
      ? {
          ...provider,
          connectionError: provider.connectionError
            ? "WhatsApp bağlantısı kullanılamıyor. Yeniden bağlanmayı deneyin."
            : null,
        }
      : null,
    preferences: {
      mode: setting?.defaultNotificationChannel === "WHATSAPP"
        ? (setting.whatsappSmsFallback ? "WHATSAPP_FALLBACK" : "WHATSAPP")
        : "SMS",
      appointment: setting?.whatsappAppointmentEnabled ?? true,
      payment: setting?.whatsappPaymentEnabled ?? true,
      info: setting?.whatsappInfoEnabled ?? true,
    },
  });
}

export async function PUT(request: NextRequest) {
  const auth = await authorize(true);
  if (auth.error) return auth.error;
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json({ message: "Yalnızca klinik kullanıcıları güncelleyebilir." }, { status: 403 });
  if (!(await moduleEnabled(institutionId))?.whatsappEnabled) {
    return NextResponse.json({ message: "WhatsApp modülü kliniğiniz için açık değil." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const mode = String(body.mode || "");
  if (!new Set(["SMS", "WHATSAPP", "WHATSAPP_FALLBACK"]).has(mode)) {
    return NextResponse.json({ message: "Bildirim kanalı seçimi geçersiz." }, { status: 400 });
  }
  for (const key of ["appointment", "payment", "info"]) {
    if (typeof body[key] !== "boolean") return NextResponse.json({ message: "Bildirim tercihi geçersiz." }, { status: 400 });
  }
  if (mode !== "SMS") {
    // QR ile bağlı numara (WHATSAPP_WEB) ya da Meta bağlantısı yeterli.
    const provider = await findConnectedWhatsapp(institutionId);
    if (!provider) {
      return NextResponse.json({ message: "WhatsApp kanalını seçmeden önce bağlantıyı tamamlayın." }, { status: 409 });
    }
  }

  await prisma.setting.update({
    where: { institutionId },
    data: {
      defaultNotificationChannel: mode === "SMS" ? "SMS" : "WHATSAPP",
      whatsappSmsFallback: mode === "WHATSAPP_FALLBACK",
      whatsappAppointmentEnabled: body.appointment as boolean,
      whatsappPaymentEnabled: body.payment as boolean,
      whatsappInfoEnabled: body.info as boolean,
    },
  });
  await writeAudit(auth.user.id, "WHATSAPP_DELIVERY_SETTINGS_UPDATE", `WhatsApp gönderim modu güncellendi: ${mode}.`);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const auth = await authorize(true);
  if (auth.error) return auth.error;
  if (!canManageConnection(auth.user.role)) {
    return NextResponse.json({ message: "WhatsApp bağlantısını yalnızca yöneticiler kesebilir." }, { status: 403 });
  }
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json({ message: "Yalnızca klinik kullanıcıları bağlantıyı kesebilir." }, { status: 403 });

  const provider = await prisma.whatsappProviderConfig.findUnique({
    where: { institutionId_code: { institutionId, code: PROVIDER_CODE } },
  });
  if (!provider) return NextResponse.json({ ok: true });

  let unsubscribeWarning: string | null = null;
  const token = decryptField(provider.accessTokenEncrypted || "");
  if (provider.businessAccountId && token) {
    const otherConnections = await prisma.whatsappProviderConfig.count({
      where: {
        id: { not: provider.id },
        businessAccountId: provider.businessAccountId,
        isActive: true,
        connectionStatus: "CONNECTED",
      },
    });
    if (otherConnections === 0) {
      try {
        await unsubscribeMetaWaba(provider.businessAccountId, token);
      } catch {
        unsubscribeWarning = "Meta webhook aboneliği uzaktan kaldırılamadı; yerel bağlantı güvenli biçimde kapatıldı.";
      }
    }
  }

  await prisma.$transaction([
    prisma.whatsappProviderConfig.update({
      where: { id: provider.id },
      data: {
        isActive: false,
        connectionStatus: "DISCONNECTED",
        accessTokenEncrypted: null,
        apiKey: null,
        connectionError: unsubscribeWarning,
        disconnectedAt: new Date(),
      },
    }),
    prisma.setting.update({
      where: { institutionId },
      data: { defaultNotificationChannel: "SMS" },
    }),
  ]);
  await writeAudit(auth.user.id, "WHATSAPP_DISCONNECTED", "Klinik Meta WhatsApp bağlantısını kesti; bildirim kanalı SMS'e alındı.");
  return NextResponse.json({ ok: true, warning: unsubscribeWarning });
}
