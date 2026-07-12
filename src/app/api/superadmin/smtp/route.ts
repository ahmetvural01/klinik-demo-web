import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const config = await prisma.smtpConfig.findUnique({ where: { id: 1 } });
  if (!config) {
    return NextResponse.json({
      id: 1, host: "", port: 587, secure: false,
      username: "", password: "", fromName: "Klinik Yönetim Paneli",
      fromEmail: "noreply@klinik.local", isActive: false,
    });
  }

  // Şifreyi maskele
  return NextResponse.json({ ...config, password: config.password ? "••••••••" : "" });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json();

  const existing = await prisma.smtpConfig.findUnique({ where: { id: 1 } });
  const passwordToSave = body.password === "••••••••" && existing
    ? existing.password
    : (body.password || "");

  const config = await prisma.smtpConfig.upsert({
    where: { id: 1 },
    update: {
      host: body.host || "",
      port: Number(body.port) || 587,
      secure: Boolean(body.secure),
      username: body.username || "",
      password: passwordToSave,
      fromName: body.fromName || "Klinik Yönetim Paneli",
      fromEmail: body.fromEmail || "noreply@klinik.local",
      isActive: Boolean(body.isActive),
    },
    create: {
      id: 1,
      host: body.host || "",
      port: Number(body.port) || 587,
      secure: Boolean(body.secure),
      username: body.username || "",
      password: passwordToSave,
      fromName: body.fromName || "Klinik Yönetim Paneli",
      fromEmail: body.fromEmail || "noreply@klinik.local",
      isActive: Boolean(body.isActive),
    },
  });

  return NextResponse.json({ ...config, password: config.password ? "••••••••" : "" });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json();

  if (body.action !== "test") {
    return NextResponse.json({ message: "Geçersiz işlem" }, { status: 400 });
  }

  if (!body.host || !body.username || !body.password || !body.testTo) {
    return NextResponse.json({ message: "host, username, password ve testTo zorunlu" }, { status: 400 });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: body.host,
      port: Number(body.port) || 587,
      secure: Boolean(body.secure),
      auth: { user: body.username, pass: body.password },
    });

    await transporter.verify();
    await transporter.sendMail({
      from: `"${body.fromName || "Klinik Yönetim Paneli"}" <${body.fromEmail || body.username}>`,
      to: body.testTo,
      subject: "Klinik Yönetim Paneli - SMTP Test",
      html: "<p>Bu bir test e-postasıdır. SMTP yapılandırmanız başarılı!</p>",
    });

    return NextResponse.json({ success: true, message: `Test e-postası ${body.testTo} adresine gönderildi` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 422 });
  }
}
