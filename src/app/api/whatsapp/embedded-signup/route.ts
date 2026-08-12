import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { encryptField, isEncryptedValue } from "@/lib/field-crypto";
import {
  completeMetaEmbeddedSignup,
  getMetaWhatsappReadiness,
  getMetaWhatsappPublicConfig,
  hashEmbeddedSignupState,
} from "@/lib/meta-whatsapp";
import { prisma } from "@/lib/prisma";
import { BusinessRuleError, publicErrorResponse } from "@/lib/public-error";

const PROVIDER_CODE = "META_EMBEDDED";

async function authorize() {
  return requireAuth("whatsapp:write");
}

async function requireEnabledInstitution(institutionId: string) {
  return prisma.institution.findFirst({
    where: { id: institutionId, isActive: true, whatsappEnabled: true },
    select: { id: true, name: true },
  });
}

export async function POST(request: NextRequest) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  if (auth.user.role !== "YONETICI" && auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "WhatsApp bağlantısını yalnızca yöneticiler kurabilir." }, { status: 403 });
  }
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json({ message: "Yalnızca klinik kullanıcıları bağlanabilir." }, { status: 403 });

  const institution = await requireEnabledInstitution(institutionId);
  if (!institution) return NextResponse.json({ message: "WhatsApp modülü kliniğiniz için açık değil." }, { status: 403 });

  if (!getMetaWhatsappReadiness().ready) {
    return NextResponse.json(
      { message: "WhatsApp bağlantı hizmeti henüz platform yöneticisi tarafından kullanıma açılmadı." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "start");

  if (action === "start") {
    try {
      const publicConfig = getMetaWhatsappPublicConfig();
      const state = crypto.randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      await prisma.$transaction([
        prisma.whatsappSignupSession.deleteMany({
          where: { institutionId, userId: auth.user.id },
        }),
        prisma.whatsappSignupSession.create({
          data: { institutionId, userId: auth.user.id, stateHash: hashEmbeddedSignupState(state), expiresAt },
        }),
        prisma.whatsappProviderConfig.upsert({
          where: { institutionId_code: { institutionId, code: PROVIDER_CODE } },
          create: {
            institutionId,
            code: PROVIDER_CODE,
            name: `${institution.name} WhatsApp`,
            providerType: "META_CLOUD",
            connectionStatus: "CONNECTING",
            isActive: false,
            apiVersion: publicConfig.apiVersion,
          },
          update: { connectionStatus: "CONNECTING", connectionError: null },
        }),
      ]);
      return NextResponse.json({ ...publicConfig, state, expiresAt });
    } catch (error) {
      console.error("[whatsapp embedded signup start]", error);
      return NextResponse.json(
        { message: "WhatsApp bağlantısı başlatılamadı. Lütfen kısa bir süre sonra yeniden deneyin." },
        { status: 503 },
      );
    }
  }

  if (action === "cancel") {
    await prisma.$transaction([
      prisma.whatsappSignupSession.updateMany({
        where: { institutionId, userId: auth.user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.whatsappProviderConfig.updateMany({
        where: { institutionId, code: PROVIDER_CODE, connectionStatus: "CONNECTING" },
        data: { isActive: false, connectionStatus: "NOT_CONNECTED", connectionError: null },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (action !== "complete") return NextResponse.json({ message: "Geçersiz işlem." }, { status: 400 });
  const state = typeof body.state === "string" ? body.state : "";
  const code = typeof body.code === "string" ? body.code : "";
  const businessAccountId = typeof body.businessAccountId === "string" ? body.businessAccountId : "";
  const phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId : "";
  const businessId = typeof body.businessId === "string" ? body.businessId : null;
  if (!state || !code || !businessAccountId || !phoneNumberId) {
    return NextResponse.json({ message: "Meta bağlantı yanıtı eksik. Lütfen yeniden deneyin." }, { status: 400 });
  }
  if (
    state.length > 100 ||
    code.length > 4096 ||
    !/^\d{5,64}$/.test(businessAccountId) ||
    !/^\d{5,64}$/.test(phoneNumberId) ||
    (businessId && !/^\d{5,64}$/.test(businessId))
  ) {
    return NextResponse.json({ message: "Meta bağlantı yanıtı geçersiz." }, { status: 400 });
  }

  const session = await prisma.whatsappSignupSession.findUnique({ where: { stateHash: hashEmbeddedSignupState(state) } });
  if (!session || session.institutionId !== institutionId || session.userId !== auth.user.id || session.usedAt || session.expiresAt <= new Date()) {
    return NextResponse.json({ message: "Bağlantı oturumu geçersiz veya süresi dolmuş." }, { status: 409 });
  }
  const consumed = await prisma.whatsappSignupSession.updateMany({
    where: { id: session.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) return NextResponse.json({ message: "Bağlantı oturumu daha önce kullanılmış." }, { status: 409 });

  try {
    const meta = await completeMetaEmbeddedSignup({ code, businessAccountId, phoneNumberId, businessId });
    const encryptedToken = encryptField(meta.accessToken);
    const encryptedRegistrationPin = encryptField(meta.registrationPin);
    if (!isEncryptedValue(encryptedToken) || !isEncryptedValue(encryptedRegistrationPin)) {
      throw new BusinessRuleError(
        "WhatsApp bağlantısı güvenli şekilde kaydedilemedi. Platform yöneticinizle iletişime geçin.",
        503,
      );
    }
    const duplicate = await prisma.whatsappProviderConfig.findFirst({
      where: { phoneNumberId: meta.phoneNumberId, institutionId: { not: institutionId } },
      select: { id: true },
    });
    if (duplicate) throw new BusinessRuleError("Bu WhatsApp numarası başka bir klinik hesabına bağlı.", 409);

    const connectedAt = new Date();
    await prisma.whatsappProviderConfig.upsert({
      where: { institutionId_code: { institutionId, code: PROVIDER_CODE } },
      create: {
        institutionId,
        code: PROVIDER_CODE,
        name: `${institution.name} WhatsApp`,
        providerType: "META_CLOUD",
        isActive: true,
        connectionStatus: "CONNECTED",
        accessTokenEncrypted: encryptedToken,
        registrationPinEncrypted: encryptedRegistrationPin,
        phoneNumberId: meta.phoneNumberId,
        businessAccountId: meta.businessAccountId,
        businessId: meta.businessId,
        displayPhoneNumber: meta.displayPhoneNumber,
        verifiedName: meta.verifiedName,
        tokenExpiresAt: meta.tokenExpiresAt,
        apiVersion: meta.apiVersion,
        connectedAt,
        disconnectedAt: null,
        connectionError: null,
      },
      update: {
        providerType: "META_CLOUD",
        isActive: true,
        connectionStatus: "CONNECTED",
        accessTokenEncrypted: encryptedToken,
        registrationPinEncrypted: encryptedRegistrationPin,
        apiKey: null,
        phoneNumberId: meta.phoneNumberId,
        businessAccountId: meta.businessAccountId,
        businessId: meta.businessId,
        displayPhoneNumber: meta.displayPhoneNumber,
        verifiedName: meta.verifiedName,
        tokenExpiresAt: meta.tokenExpiresAt,
        apiVersion: meta.apiVersion,
        connectedAt,
        disconnectedAt: null,
        connectionError: null,
      },
    });
    await writeAudit(auth.user.id, "WHATSAPP_EMBEDDED_SIGNUP_CONNECTED", `Meta WhatsApp bağlantısı tamamlandı (${meta.displayPhoneNumber || "numara doğrulandı"}).`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[whatsapp embedded signup complete]", error);
    const publicError = publicErrorResponse(
      error,
      "WhatsApp bağlantısı tamamlanamadı. Meta hesabınızı ve numara doğrulamasını kontrol edip yeniden deneyin.",
      502,
    );
    await prisma.whatsappProviderConfig.updateMany({
      where: { institutionId, code: PROVIDER_CODE },
      data: { isActive: false, connectionStatus: "ERROR", connectionError: publicError.message },
    });
    return NextResponse.json({ message: publicError.message }, { status: publicError.status });
  }
}
