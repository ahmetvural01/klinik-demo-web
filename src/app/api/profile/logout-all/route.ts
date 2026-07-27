import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit, invalidateUserSessionCache } from "@/lib/api";
import { signToken, setAuthCookie } from "@/lib/auth";

/**
 * Kullanıcının kendi hesabına ait, bu tarayıcı/cihaz dışındaki TÜM
 * oturumları (ör. çalınmış/unutulmuş bir token, paylaşılan bir cihaz)
 * anında geçersiz kılar. tokenVersion artırılır; bu isteği yapan mevcut
 * oturum kesintiye uğramasın diye hemen ardından yeni tokenVersion'lı taze
 * bir cookie yazılır (bkz. src/app/api/profile/password/route.ts — aynı desen).
 */
export async function POST() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const updated = await prisma.user.update({
    where: { id: auth.user.id },
    data: { tokenVersion: { increment: 1 } },
  });
  invalidateUserSessionCache(auth.user.id);
  await writeAudit(auth.user.id, "LOGOUT_ALL_DEVICES", "Kullanıcı diğer tüm cihazlardaki oturumları sonlandırdı");

  const freshToken = signToken({
    userId: updated.id,
    role: updated.role,
    institutionId: updated.institutionId,
    fullName: updated.fullName,
    tokenVersion: updated.tokenVersion,
  });
  await setAuthCookie(freshToken);

  return NextResponse.json({ ok: true });
}
