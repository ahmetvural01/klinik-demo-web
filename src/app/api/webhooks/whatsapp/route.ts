import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptField, encryptField } from "@/lib/field-crypto";
import { normalizeWhatsappPhone } from "@/lib/whatsapp";

type MetaMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  context?: { id?: string };
};

type MetaWebhook = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: MetaMessage[];
        statuses?: Array<{
          id?: string;
          status?: string;
          timestamp?: string;
          recipient_id?: string;
          errors?: Array<{ code?: number; title?: string; message?: string }>;
        }>;
      };
    }>;
  }>;
};

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function eventDate(timestamp?: string) {
  if (!timestamp) return new Date();
  const value = Number(timestamp);
  return Number.isFinite(value) ? new Date(value * 1000) : new Date();
}

function messageText(message: MetaMessage) {
  return message.text?.body
    || message.button?.text
    || message.interactive?.button_reply?.title
    || message.interactive?.list_reply?.title
    || `[${message.type || "desteklenmeyen mesaj"}]`;
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token") || "";
  const challenge = request.nextUrl.searchParams.get("hub.challenge") || "";
  if (mode !== "subscribe" || !token) return new NextResponse("Doğrulama başarısız", { status: 403 });

  const providers = await prisma.whatsappProviderConfig.findMany({
    where: { providerType: "META_CLOUD", isActive: true },
    select: { verifyToken: true },
  });
  const verified = providers.some((provider) => {
    const expected = decryptField(provider.verifyToken || "");
    return expected && secureEqual(expected, token);
  });
  return verified
    ? new NextResponse(challenge, { status: 200 })
    : new NextResponse("Doğrulama başarısız", { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  let payload: MetaWebhook;
  try {
    payload = JSON.parse(raw) as MetaWebhook;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const values = (payload.entry || []).flatMap((entry) =>
    (entry.changes || []).map((change) => change.value).filter(Boolean),
  );
  const phoneNumberId = values.find((value) => value?.metadata?.phone_number_id)?.metadata?.phone_number_id;
  if (!phoneNumberId) return NextResponse.json({ ok: true });

  const provider = await prisma.whatsappProviderConfig.findFirst({
    where: { phoneNumberId, providerType: "META_CLOUD", isActive: true },
  });
  if (!provider || !provider.institutionId) {
    return NextResponse.json({ ok: false, message: "Kurum bağlantılı sağlayıcı bulunamadı." }, { status: 404 });
  }

  const appSecret = decryptField(provider.appSecret || "");
  const signature = request.headers.get("x-hub-signature-256") || "";
  if (!appSecret) {
    return NextResponse.json(
      { ok: false, message: "Webhook imza anahtarı yapılandırılmamış." },
      { status: 503 },
    );
  }
  const expected = `sha256=${createHmac("sha256", appSecret).update(raw).digest("hex")}`;
  if (!secureEqual(expected, signature)) {
    return NextResponse.json({ ok: false, message: "Webhook imzası geçersiz." }, { status: 401 });
  }

  for (const value of values) {
    for (const status of value?.statuses || []) {
      if (!status.id) continue;
      const normalizedStatus = String(status.status || "UNKNOWN").toUpperCase();
      const at = eventDate(status.timestamp);
      await prisma.whatsappMessage.updateMany({
        where: { externalMessageId: status.id, institutionId: provider.institutionId },
        data: {
          status: normalizedStatus,
          ...(normalizedStatus === "DELIVERED" ? { deliveredAt: at } : {}),
          ...(normalizedStatus === "READ" ? { readAt: at } : {}),
          ...(normalizedStatus === "FAILED"
            ? {
                failedAt: at,
                errorDetail: status.errors?.map((error) =>
                  [error.code, error.title, error.message].filter(Boolean).join(" - ")
                ).join(" | ") || "WhatsApp mesajı teslim edilemedi.",
              }
            : {}),
        },
      });
    }

    for (const message of value?.messages || []) {
      if (!message.id || !message.from) continue;
      const phone = normalizeWhatsappPhone(message.from);
      if (!phone) continue;

      const phoneSuffix = phone.slice(-7);
      const patients = await prisma.patient.findMany({
        where: {
          institutionId: provider.institutionId,
          archivedAt: null,
          phone: { contains: phoneSuffix },
        },
        select: { id: true, phone: true, phoneCountryCode: true },
        take: 25,
      });
      const patient = patients.find((candidate) =>
        normalizeWhatsappPhone(candidate.phone, candidate.phoneCountryCode) === phone
      );
      await prisma.whatsappMessage.upsert({
        where: { externalMessageId: message.id },
        update: {
          status: "RECEIVED",
          content: encryptField(messageText(message)),
        },
        create: {
          institutionId: provider.institutionId,
          providerId: provider.id,
          patientId: patient?.id || null,
          externalMessageId: message.id,
          contextMessageId: message.context?.id || null,
          direction: "INBOUND",
          status: "RECEIVED",
          phone,
          content: encryptField(messageText(message)),
          sentAt: eventDate(message.timestamp),
        },
      });
    }
  }
  return NextResponse.json({ ok: true });
}
