import { NextResponse } from "next/server";
import { decodeTokenUser, getVisibleRole } from "@/lib/auth";

export async function GET() {
  const user = decodeTokenUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // SUPERADMIN rolü olduğu gibi döndürülür (superadmin panel sayfaları bu değeri kontrol eder)
  // Klinik panel kullanıcıları için getVisibleRole uygulanır
  const role = user.role === "SUPERADMIN" ? "SUPERADMIN" : getVisibleRole(user.role);
  return NextResponse.json({
    id: user.id,
    fullName: user.fullName,
    role,
    superadminModules: user.superadminModules ?? null,
  });
}
