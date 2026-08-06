import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";
import { encryptField, decryptField } from "@/lib/field-crypto";

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
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek" }, { status: 400 });
  }
  const port = Number(body.port ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return NextResponse.json({ message: "SMTP portu 1-65535 arasında olmalı" }, { status: 400 });
  }
  if (body.secure !== undefined && typeof body.secure !== "boolean") {
    return NextResponse.json({ message: "Güvenli bağlantı bilgisi geçersiz" }, { status: 400 });
  }
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    return NextResponse.json({ message: "Aktiflik bilgisi geçersiz" }, { status: 400 });
  }
  const host = typeof body.host === "string" ? body.host.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const fromName = typeof body.fromName === "string" ? body.fromName.trim() : "Klinik Yönetim Paneli";
  const fromEmail = typeof body.fromEmail === "string" ? body.fromEmail.trim() : "noreply@klinik.local";
  if (host.length > 255 || username.length > 254 || fromName.length > 160 || !/^\S+@\S+\.\S+$/.test(fromEmail)) {
    return NextResponse.json({ message: "SMTP sunucu veya gönderen bilgileri geçersiz" }, { status: 400 });
  }
  if (body.isActive === true && (!host || !username || !body.password)) {
    return NextResponse.json({ message: "Aktif SMTP için sunucu, kullanıcı adı ve şifre zorunlu" }, { status: 400 });
  }

  const existing = await prisma.smtpConfig.findUnique({ where: { id: 1 } });
  // SMTP şifresi önceden düz metin kaydediliyordu — veritabanına erişimi olan
  // herhangi biri (ör. bir SQL injection/okuma hatası) doğrudan kimlik
  // bilgisini görebilirdi (bkz. denetim raporu). Hasta belgelerinde zaten
  // kullanılan alan-bazlı AES-256-GCM şifreleme burada da uygulanıyor.
  const passwordToSave = body.password === "••••••••" && existing
    ? existing.password
    : body.password ? encryptField(String(body.password)) : "";

  const config = await prisma.smtpConfig.upsert({
    where: { id: 1 },
    update: {
      host,
      port,
      secure: body.secure ?? false,
      username,
      password: passwordToSave,
      fromName,
      fromEmail,
      isActive: body.isActive ?? false,
    },
    create: {
      id: 1,
      host,
      port,
      secure: body.secure ?? false,
      username,
      password: passwordToSave,
      fromName,
      fromEmail,
      isActive: body.isActive ?? false,
    },
  });

  await writeAudit(auth.user.id, "SUPERADMIN_SMTP_UPDATE", `SMTP ayarı güncellendi: ${config.host}:${config.port} / ${config.fromEmail} / ${config.isActive ? "aktif" : "pasif"}`);
  return NextResponse.json({ ...config, password: config.password ? "••••••••" : "" });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Geçersiz istek" }, { status: 400 });
  }

  if (body.action !== "test") {
    return NextResponse.json({ message: "Geçersiz işlem" }, { status: 400 });
  }

  if (!body.host || !body.username || !body.password || !body.testTo) {
    return NextResponse.json({ message: "host, username, password ve testTo zorunlu" }, { status: 400 });
  }
  const port = Number(body.port ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return NextResponse.json({ message: "SMTP portu 1-65535 arasında olmalı" }, { status: 400 });
  }
  if (body.secure !== undefined && typeof body.secure !== "boolean") {
    return NextResponse.json({ message: "Güvenli bağlantı bilgisi geçersiz" }, { status: 400 });
  }
  if (!/^\S+@\S+\.\S+$/.test(String(body.testTo).trim())) {
    return NextResponse.json({ message: "Geçerli bir test e-posta adresi girin" }, { status: 400 });
  }

  // Form alanı kaydedilmiş şifreyi maskeli ("••••••••") gösterir — kullanıcı
  // şifreyi değiştirmeden test gönderirse gerçek (kayıtlı, şifreli) şifre
  // burada çözülüp kullanılır; aksi halde SMTP sunucusuna literal olarak
  // "••••••••" gönderilip doğrulama her zaman başarısız olurdu.
  let testPassword = body.password as string;
  if (testPassword === "••••••••") {
    const existing = await prisma.smtpConfig.findUnique({ where: { id: 1 } });
    testPassword = existing?.password ? decryptField(existing.password) : "";
  }

  try {
    const transporter = nodemailer.createTransport({
      host: body.host,
      port,
      secure: body.secure ?? false,
      auth: { user: body.username, pass: testPassword },
      disableFileAccess: true,
      disableUrlAccess: true,
    });

    await transporter.verify();
    await transporter.sendMail({
      from: `"${body.fromName || "Klinik Yönetim Paneli"}" <${body.fromEmail || body.username}>`,
      to: body.testTo,
      subject: "Klinik Yönetim Paneli - SMTP Test",
      html: "<p>Bu bir test e-postasıdır. SMTP yapılandırmanız başarılı!</p>",
    });

    await writeAudit(auth.user.id, "SUPERADMIN_SMTP_TEST_SEND", `SMTP test e-postası gönderildi: ${body.testTo}`);
    return NextResponse.json({ success: true, message: `Test e-postası ${body.testTo} adresine gönderildi` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await writeAudit(auth.user.id, "SUPERADMIN_SMTP_TEST_FAILED", `SMTP test başarısız: ${body.testTo || "-"} / ${message}`);
    return NextResponse.json({ success: false, message }, { status: 422 });
  }
}
