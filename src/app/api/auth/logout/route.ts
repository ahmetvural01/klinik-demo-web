import { NextResponse } from "next/server";
import { clearAuthCookie, decodeTokenUser } from "@/lib/auth";
import { writeAudit } from "@/lib/api";

export async function POST() {
  const user = decodeTokenUser();

  if (user) {
    await writeAudit(user.id, "LOGOUT", "Kullanici cikis yapti");
  }

  clearAuthCookie();
  return NextResponse.json({ ok: true });
}
