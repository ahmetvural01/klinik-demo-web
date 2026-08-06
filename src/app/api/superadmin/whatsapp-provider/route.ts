import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { encryptField } from "@/lib/field-crypto";

const VALID_HTTP_METHODS = new Set(["GET", "POST"]);
const VALID_PROVIDER_TYPES = new Set(["CUSTOM", "META_CLOUD"]);

function providerInputError(body: Record<string, unknown>, creating: boolean): string | null {
  if (creating && (typeof body.code !== "string" || !/^[A-Za-z0-9_-]{2,40}$/.test(body.code.trim()))) {
    return "Sağlayıcı kodu 2-40 karakter olmalı";
  }
  if ((creating || body.name !== undefined) && (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120)) {
    return "Sağlayıcı adı 1-120 karakter olmalı";
  }
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") return "Aktiflik bilgisi geçersiz";
  if (body.priority !== undefined) {
    const priority = Number(body.priority);
    if (!Number.isInteger(priority) || priority < 1 || priority > 10000) return "Öncelik 1-10000 arasında tam sayı olmalı";
  }
  if (body.providerType !== undefined && !VALID_PROVIDER_TYPES.has(String(body.providerType))) return "Geçersiz sağlayıcı türü";
  if (body.httpMethod !== undefined && !VALID_HTTP_METHODS.has(String(body.httpMethod).toUpperCase())) return "HTTP yöntemi GET veya POST olmalı";
  if (body.sendUrl) {
    try {
      const url = new URL(String(body.sendUrl));
      if (!new Set(["http:", "https:"]).has(url.protocol)) return "Gönderim adresi HTTP(S) olmalı";
    } catch {
      return "Gönderim adresi geçersiz";
    }
  }
  if (body.headersJson) {
    try {
      const parsed = JSON.parse(String(body.headersJson));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "Başlıklar JSON nesnesi olmalı";
    } catch {
      return "Başlıklar geçerli JSON olmalı";
    }
  }
  return null;
}

// GET zaten hassas alanları maskeliyordu ama POST/PUT şifreli (plaintext
// değil, ama yine de gereksiz) değerleri client'a olduğu gibi dönüyordu —
// aynı response şekli tüm uçlarda tutarlı olmalı (bkz. denetim raporu).
function maskWhatsappProvider<T extends {
  password: string | null;
  apiKey: string | null;
  verifyToken: string | null;
  appSecret: string | null;
}>(p: T) {
  return {
    ...p,
    password: p.password ? "********" : "",
    apiKey: p.apiKey ? "********" : "",
    verifyToken: p.verifyToken ? "********" : "",
    appSecret: p.appSecret ? "********" : "",
    hasPassword: Boolean(p.password),
    hasApiKey: Boolean(p.apiKey),
    hasVerifyToken: Boolean(p.verifyToken),
    hasAppSecret: Boolean(p.appSecret),
  };
}

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const providers = await prisma.whatsappProviderConfig.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    providers: providers.map((p) => ({
      ...p,
      password: p.password ? "********" : "",
      apiKey: p.apiKey ? "********" : "",
      verifyToken: p.verifyToken ? "********" : "",
      appSecret: p.appSecret ? "********" : "",
      hasPassword: Boolean(p.password),
      hasApiKey: Boolean(p.apiKey),
      hasVerifyToken: Boolean(p.verifyToken),
      hasAppSecret: Boolean(p.appSecret),
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const body = await request.json() as {
    code?: string;
    name?: string;
    institutionId?: string;
    providerType?: string;
    isActive?: boolean;
    priority?: number;
    sendUrl?: string;
    httpMethod?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    sender?: string;
    headersJson?: string;
    bodyTemplate?: string;
    successPattern?: string;
    phoneNumberId?: string;
    businessAccountId?: string;
    verifyToken?: string;
    appSecret?: string;
    apiVersion?: string;
    appointmentTemplateName?: string;
    appointmentTemplateLanguage?: string;
  };

  const inputError = providerInputError(body as Record<string, unknown>, true);
  if (inputError) return NextResponse.json({ message: inputError }, { status: 400 });

  if (!body.code || !body.name || !body.institutionId) {
    return NextResponse.json({ message: "code, name ve institutionId zorunlu — platform genelinde paylaşılan sağlayıcı desteklenmiyor" }, { status: 400 });
  }
  const institutionId = body.institutionId;
  const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { id: true } });
  if (!institution) return NextResponse.json({ message: "Klinik bulunamadı" }, { status: 404 });

  const created = await prisma.$transaction(async (tx) => {
    if (body.isActive) {
      // Yalnızca aynı kliniğin diğer sağlayıcıları pasifleşir — başka bir
      // kliniğin aktif WhatsApp sağlayıcısına dokunulmaz (bkz.
      // docs/ILETISIM-MIMARISI-RAPORU.md §3: her klinik kendi numarasından gönderir).
      await tx.whatsappProviderConfig.updateMany({ where: { isActive: true, institutionId }, data: { isActive: false } });
    }

    return tx.whatsappProviderConfig.create({
      data: {
        code: (body.code ?? "").trim().toUpperCase(),
        institutionId,
        name: (body.name ?? "").trim(),
        providerType: body.providerType || "CUSTOM",
        isActive: body.isActive ?? false,
        priority: Number(body.priority ?? 100),
        sendUrl: body.sendUrl || null,
        httpMethod: (body.httpMethod || "POST").toUpperCase(),
        username: body.username || null,
        password: body.password ? encryptField(body.password) : null,
        apiKey: body.apiKey ? encryptField(body.apiKey) : null,
        sender: body.sender || null,
        headersJson: body.headersJson || null,
        bodyTemplate: body.bodyTemplate || null,
        successPattern: body.successPattern || null,
        phoneNumberId: body.phoneNumberId || null,
        businessAccountId: body.businessAccountId || null,
        verifyToken: body.verifyToken ? encryptField(body.verifyToken) : null,
        appSecret: body.appSecret ? encryptField(body.appSecret) : null,
        apiVersion: body.apiVersion || "v23.0",
        appointmentTemplateName: body.appointmentTemplateName || null,
        appointmentTemplateLanguage: body.appointmentTemplateLanguage || "tr",
      },
    });
  });

  await writeAudit(auth.user.id, "SUPERADMIN_WHATSAPP_PROVIDER_CREATE", `${created.name} WhatsApp sağlayıcısı oluşturuldu${created.isActive ? " ve aktif edildi" : ""}`);
  return NextResponse.json(maskWhatsappProvider(created));
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const body = await request.json() as {
    id?: string;
    institutionId?: string;
    name?: string;
    providerType?: string;
    isActive?: boolean;
    priority?: number;
    sendUrl?: string;
    httpMethod?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    sender?: string;
    headersJson?: string;
    bodyTemplate?: string;
    successPattern?: string;
    phoneNumberId?: string;
    businessAccountId?: string;
    verifyToken?: string;
    appSecret?: string;
    apiVersion?: string;
    appointmentTemplateName?: string;
    appointmentTemplateLanguage?: string;
  };

  const inputError = providerInputError(body as Record<string, unknown>, false);
  if (inputError) return NextResponse.json({ message: inputError }, { status: 400 });

  if (!body.id) {
    return NextResponse.json({ message: "id zorunlu" }, { status: 400 });
  }

  const current = await prisma.whatsappProviderConfig.findUnique({ where: { id: body.id } });
  if (!current) {
    return NextResponse.json({ message: "Sağlayıcı bulunamadı" }, { status: 404 });
  }

  const targetInstitutionId = body.institutionId || current.institutionId;
  if (targetInstitutionId !== current.institutionId) {
    const targetInstitution = await prisma.institution.findUnique({ where: { id: targetInstitutionId }, select: { id: true } });
    if (!targetInstitution) return NextResponse.json({ message: "Hedef klinik bulunamadı" }, { status: 404 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const willActivate = body.isActive === true || (body.isActive === undefined && current.isActive);
    if (willActivate) {
      // Yalnızca aynı kliniğin diğer sağlayıcıları pasifleşir (bkz. POST'taki not).
      await tx.whatsappProviderConfig.updateMany({
        where: { isActive: true, id: { not: body.id }, institutionId: targetInstitutionId },
        data: { isActive: false },
      });
    }

    return tx.whatsappProviderConfig.update({
      where: { id: body.id },
      data: {
        name: body.name?.trim() ?? current.name,
        institutionId: targetInstitutionId,
        providerType: body.providerType ?? current.providerType,
        isActive: body.isActive ?? current.isActive,
        priority: body.priority == null ? current.priority : Number(body.priority),
        sendUrl: body.sendUrl === undefined ? current.sendUrl : (body.sendUrl || null),
        httpMethod: body.httpMethod ? body.httpMethod.toUpperCase() : current.httpMethod,
        username: body.username === undefined ? current.username : (body.username || null),
        password: body.password === undefined || body.password === "" ? current.password : encryptField(body.password),
        apiKey: body.apiKey === undefined || body.apiKey === "" ? current.apiKey : encryptField(body.apiKey),
        sender: body.sender === undefined ? current.sender : (body.sender || null),
        headersJson: body.headersJson === undefined ? current.headersJson : (body.headersJson || null),
        bodyTemplate: body.bodyTemplate === undefined ? current.bodyTemplate : (body.bodyTemplate || null),
        successPattern: body.successPattern === undefined ? current.successPattern : (body.successPattern || null),
        phoneNumberId: body.phoneNumberId === undefined ? current.phoneNumberId : (body.phoneNumberId || null),
        businessAccountId: body.businessAccountId === undefined ? current.businessAccountId : (body.businessAccountId || null),
        verifyToken: body.verifyToken === undefined || body.verifyToken === ""
          ? current.verifyToken
          : encryptField(body.verifyToken),
        appSecret: body.appSecret === undefined || body.appSecret === ""
          ? current.appSecret
          : encryptField(body.appSecret),
        apiVersion: body.apiVersion || current.apiVersion,
        appointmentTemplateName: body.appointmentTemplateName === undefined
          ? current.appointmentTemplateName
          : (body.appointmentTemplateName || null),
        appointmentTemplateLanguage: body.appointmentTemplateLanguage || current.appointmentTemplateLanguage,
      },
    });
  });

  await writeAudit(auth.user.id, "SUPERADMIN_WHATSAPP_PROVIDER_UPDATE", `${updated.name} WhatsApp sağlayıcısı güncellendi${updated.isActive ? " (aktif)" : ""}`);
  return NextResponse.json(maskWhatsappProvider(updated));
}
