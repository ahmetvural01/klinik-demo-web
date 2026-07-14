import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json();
  const { password } = body;

  if (!password || typeof password !== "string") {
    return NextResponse.json({ message: "Şifre gerekli" }, { status: 400 });
  }

  const masterPassword = process.env.SMTP_MASTER_PASSWORD;
  if (!masterPassword) {
    return NextResponse.json({ message: "SMTP master şifresi yapılandırılmamış" }, { status: 500 });
  }

  if (password !== masterPassword) {
    await writeAudit(auth.user.id, "SUPERADMIN_SMTP_UNLOCK_FAILED", "SMTP kilit açma denemesi başarısız");
    return NextResponse.json({ message: "Şifre hatalı" }, { status: 401 });
  }

  // Token: kısa süreli bir hash döndür (client sessionStorage'da saklar)
  const token = Buffer.from(`smtp-unlocked:${Date.now()}`).toString("base64");
  await writeAudit(auth.user.id, "SUPERADMIN_SMTP_UNLOCK", "SMTP şifre alanı geçici olarak açıldı");
  return NextResponse.json({ token });
}
