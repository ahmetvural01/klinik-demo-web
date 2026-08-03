import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearGhostAuthCookie, decodeTokenUserFromToken } from "@/lib/auth";
import { writeAudit } from "@/lib/api";

/**
 * Ghost (süperadmin gizli klinik girişi) oturumundan çıkış.
 * Yalnızca ghost çerezi temizlenir — süperadmin'in kendi klinik_token'ı hiç
 * dokunulmadığı için (bkz. impersonate route notu) burada yeniden giriş
 * GEREKMEZ; bu sekme /superadmin'e yönlendirilince zaten gerçek süperadmin
 * kimliğiyle devam eder. Bu route'un kendi path'i /api/auth/superadmin/**
 * altında olduğundan genel ghost-öncelik kuralı burada uygulanmaz — ghost
 * çerezi doğrudan okunur.
 */
export async function POST() {
  const ghostToken = (await cookies()).get("klinik_ghost_token")?.value;
  const ghostUser = ghostToken ? decodeTokenUserFromToken(ghostToken) : null;
  if (ghostUser) {
    await writeAudit(ghostUser.id, "IMPERSONATE_END", `Ghost oturumu sonlandırıldı (${ghostUser.fullName})`);
  }
  await clearGhostAuthCookie();
  return NextResponse.json({ ok: true });
}
