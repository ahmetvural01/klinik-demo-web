import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { generateTwoFactorSecret, twoFactorKeyUri, twoFactorQrCodeDataUrl } from "@/lib/two-factor";

export async function POST() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const user = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { identityNo: true, twoFactorEnabled: true } });
  if (!user) return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
  if (user.twoFactorEnabled) {
    return NextResponse.json({ error: "İki faktörlü doğrulama zaten aktif" }, { status: 400 });
  }

  const secret = generateTwoFactorSecret();
  await prisma.user.update({ where: { id: auth.user.id }, data: { twoFactorSecret: secret, twoFactorEnabled: false } });
  await writeAudit(auth.user.id, "PROFILE_2FA_SETUP_START", "İki faktörlü doğrulama kurulum QR/secret üretildi");

  const otpauthUrl = twoFactorKeyUri(user.identityNo, secret);
  const qrCodeDataUrl = await twoFactorQrCodeDataUrl(otpauthUrl);

  return NextResponse.json({ secret, qrCodeDataUrl });
}
