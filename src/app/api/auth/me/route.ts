import { NextRequest, NextResponse } from "next/server";
import { decodeTokenUserFromToken, getVisibleRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

function readCookie(headers: Headers, name: string) {
  const raw = headers.get("cookie") || "";
  const parts = raw.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export async function GET(request: NextRequest) {
  const token = readCookie(request.headers, "klinik_token");
  const user = token ? decodeTokenUserFromToken(token) : null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // SUPERADMIN rolü olduğu gibi döndürülür (superadmin panel sayfaları bu değeri kontrol eder)
  // Klinik panel kullanıcıları için getVisibleRole uygulanır
  const role = user.role === "SUPERADMIN" ? "SUPERADMIN" : getVisibleRole(user.role);
  return NextResponse.json({
    id: user.id,
    fullName: user.fullName,
    role,
    institutionId: user.institutionId,
    superadminModules: user.superadminModules ?? null,
  });
}
