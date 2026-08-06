import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { encryptField } from "@/lib/field-crypto";

const VALID_HTTP_METHODS = new Set(["GET", "POST"]);

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
  if (body.httpMethod !== undefined && !VALID_HTTP_METHODS.has(String(body.httpMethod).toUpperCase())) {
    return "HTTP yöntemi GET veya POST olmalı";
  }
  for (const field of ["sendUrl", "balanceUrl"] as const) {
    const value = body[field];
    if (value !== undefined && value !== null && value !== "") {
      try {
        const url = new URL(String(value));
        if (!new Set(["http:", "https:"]).has(url.protocol)) return `${field} HTTP(S) adresi olmalı`;
      } catch {
        return `${field} geçerli bir adres olmalı`;
      }
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

function publicProvider<T extends { password: string | null; apiKey: string | null }>(provider: T) {
  return {
    ...provider,
    password: provider.password ? "********" : "",
    apiKey: provider.apiKey ? "********" : "",
    hasPassword: Boolean(provider.password),
    hasApiKey: Boolean(provider.apiKey),
  };
}

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const providers = await prisma.smsProviderConfig.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    providers: providers.map(publicProvider),
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
    isActive?: boolean;
    priority?: number;
    sendUrl?: string;
    balanceUrl?: string;
    httpMethod?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    sender?: string;
    headersJson?: string;
    bodyTemplate?: string;
    successPattern?: string;
  };

  const inputError = providerInputError(body as Record<string, unknown>, true);
  if (inputError) return NextResponse.json({ message: inputError }, { status: 400 });

  if (!body.code || !body.name) {
    return NextResponse.json({ message: "code ve name zorunlu" }, { status: 400 });
  }

  const created = await prisma.$transaction(async (tx) => {
    if (body.isActive) {
      await tx.smsProviderConfig.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }

    return tx.smsProviderConfig.create({
      data: {
        code: (body.code ?? "").trim().toUpperCase(),
        name: (body.name ?? "").trim(),
        isActive: body.isActive ?? false,
        priority: Number(body.priority ?? 100),
        sendUrl: body.sendUrl || null,
        balanceUrl: body.balanceUrl || null,
        httpMethod: (body.httpMethod || "POST").toUpperCase(),
        username: body.username || null,
        password: body.password ? encryptField(body.password) : null,
        apiKey: body.apiKey ? encryptField(body.apiKey) : null,
        sender: body.sender || null,
        headersJson: body.headersJson || null,
        bodyTemplate: body.bodyTemplate || null,
        successPattern: body.successPattern || null,
      },
    });
  });

  await writeAudit(auth.user.id, "SUPERADMIN_SMS_PROVIDER_CREATE", `${created.name} sağlayıcısı oluşturuldu${created.isActive ? " ve aktif edildi" : ""}`);
  return NextResponse.json(publicProvider(created));
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const body = await request.json() as {
    id?: string;
    name?: string;
    isActive?: boolean;
    priority?: number;
    sendUrl?: string;
    balanceUrl?: string;
    httpMethod?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    sender?: string;
    headersJson?: string;
    bodyTemplate?: string;
    successPattern?: string;
  };

  const inputError = providerInputError(body as Record<string, unknown>, false);
  if (inputError) return NextResponse.json({ message: inputError }, { status: 400 });

  if (!body.id) {
    return NextResponse.json({ message: "id zorunlu" }, { status: 400 });
  }

  const current = await prisma.smsProviderConfig.findUnique({ where: { id: body.id } });
  if (!current) {
    return NextResponse.json({ message: "Saglayici bulunamadi" }, { status: 404 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const willActivate = body.isActive === true;
    if (willActivate) {
      await tx.smsProviderConfig.updateMany({
        where: { isActive: true, id: { not: body.id } },
        data: { isActive: false },
      });
    }

    return tx.smsProviderConfig.update({
      where: { id: body.id },
      data: {
        name: body.name?.trim() ?? current.name,
        isActive: body.isActive ?? current.isActive,
        priority: body.priority == null ? current.priority : Number(body.priority),
        sendUrl: body.sendUrl === undefined ? current.sendUrl : (body.sendUrl || null),
        balanceUrl: body.balanceUrl === undefined ? current.balanceUrl : (body.balanceUrl || null),
        httpMethod: body.httpMethod ? body.httpMethod.toUpperCase() : current.httpMethod,
        username: body.username === undefined ? current.username : (body.username || null),
        password: body.password === undefined || body.password === ""
          ? current.password
          : encryptField(body.password),
        apiKey: body.apiKey === undefined || body.apiKey === ""
          ? current.apiKey
          : encryptField(body.apiKey),
        sender: body.sender === undefined ? current.sender : (body.sender || null),
        headersJson: body.headersJson === undefined ? current.headersJson : (body.headersJson || null),
        bodyTemplate: body.bodyTemplate === undefined ? current.bodyTemplate : (body.bodyTemplate || null),
        successPattern: body.successPattern === undefined ? current.successPattern : (body.successPattern || null),
      },
    });
  });

  await writeAudit(auth.user.id, "SUPERADMIN_SMS_PROVIDER_UPDATE", `${updated.name} sağlayıcısı güncellendi${updated.isActive ? " (aktif)" : ""}`);
  return NextResponse.json(publicProvider(updated));
}
