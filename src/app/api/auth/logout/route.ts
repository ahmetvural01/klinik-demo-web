import { NextResponse } from "next/server";
import { clearAuthCookie, decodeTokenUser } from "@/lib/auth";
import { writeAudit } from "@/lib/api";

export async function POST() {
  const user = await decodeTokenUser();

  if (user) {
    await writeAudit(user.id, "LOGOUT", "Kullanıcı sistemden çıkış yaptı.");
  }

  await clearAuthCookie();
  return NextResponse.json({ ok: true });
}
