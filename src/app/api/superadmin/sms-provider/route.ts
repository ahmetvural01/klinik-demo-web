import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

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
    providers: providers.map((p) => ({
      ...p,
      password: p.password ? "********" : "",
      apiKey: p.apiKey ? "********" : "",
      hasPassword: Boolean(p.password),
      hasApiKey: Boolean(p.apiKey),
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
        code: (body.code ?? "").toUpperCase(),
        name: body.name ?? "",
        isActive: body.isActive ?? false,
        priority: Number(body.priority ?? 100),
        sendUrl: body.sendUrl || null,
        balanceUrl: body.balanceUrl || null,
        httpMethod: (body.httpMethod || "POST").toUpperCase(),
        username: body.username || null,
        password: body.password || null,
        apiKey: body.apiKey || null,
        sender: body.sender || null,
        headersJson: body.headersJson || null,
        bodyTemplate: body.bodyTemplate || null,
        successPattern: body.successPattern || null,
      },
    });
  });

  await writeAudit(auth.user.id, "SUPERADMIN_SMS_PROVIDER_CREATE", `${created.name} sağlayıcısı oluşturuldu${created.isActive ? " ve aktif edildi" : ""}`);
  return NextResponse.json(created);
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
        name: body.name ?? current.name,
        isActive: body.isActive ?? current.isActive,
        priority: body.priority == null ? current.priority : Number(body.priority),
        sendUrl: body.sendUrl === undefined ? current.sendUrl : (body.sendUrl || null),
        balanceUrl: body.balanceUrl === undefined ? current.balanceUrl : (body.balanceUrl || null),
        httpMethod: body.httpMethod ? body.httpMethod.toUpperCase() : current.httpMethod,
        username: body.username === undefined ? current.username : (body.username || null),
        password: body.password === undefined || body.password === "" ? current.password : body.password,
        apiKey: body.apiKey === undefined || body.apiKey === "" ? current.apiKey : body.apiKey,
        sender: body.sender === undefined ? current.sender : (body.sender || null),
        headersJson: body.headersJson === undefined ? current.headersJson : (body.headersJson || null),
        bodyTemplate: body.bodyTemplate === undefined ? current.bodyTemplate : (body.bodyTemplate || null),
        successPattern: body.successPattern === undefined ? current.successPattern : (body.successPattern || null),
      },
    });
  });

  await writeAudit(auth.user.id, "SUPERADMIN_SMS_PROVIDER_UPDATE", `${updated.name} sağlayıcısı güncellendi${updated.isActive ? " (aktif)" : ""}`);
  return NextResponse.json(updated);
}
