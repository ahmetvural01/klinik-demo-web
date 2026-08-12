import { NextResponse } from "next/server";
import { decodeTokenUser } from "@/lib/auth";
import { DEFAULT_SUPERADMIN_MODULES } from "@/lib/superadmin-modules";

export async function GET() {
  const user = await decodeTokenUser();

  if (!user) return NextResponse.json({ message: "Oturum gerekli" }, { status: 401 });
  if (user.role !== "SUPERADMIN") return NextResponse.json({ message: "Bu işlem için yetkiniz yok." }, { status: 403 });
  return NextResponse.json({ modules: DEFAULT_SUPERADMIN_MODULES });
}
