import { NextResponse } from "next/server";
import { decodeTokenUser, getVisibleRole } from "@/lib/auth";

export async function GET() {
  const user = decodeTokenUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    id: user.id,
    fullName: user.fullName,
    role: getVisibleRole(user.role),
    superadminModules: null,
  });
}
