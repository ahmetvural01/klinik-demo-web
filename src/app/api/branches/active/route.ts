import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAuth, writeAudit } from "@/lib/api";
import { ACTIVE_BRANCH_COOKIE } from "@/lib/branch-context";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  const branchId = typeof body?.branchId === "string" ? body.branchId : "";
  const context = auth.user.branchContext;

  if (!context.branches.some((branch) => branch.id === branchId)) {
    return NextResponse.json({ message: "Bu şubeye erişim yetkiniz yok." }, { status: 403 });
  }

  (await cookies()).set(ACTIVE_BRANCH_COOKIE, branchId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  const label = context.branches.find((branch) => branch.id === branchId)?.name || branchId;
  await writeAudit(auth.user.id, "BRANCH_CONTEXT_CHANGE", `Aktif şube: ${label}`);
  return NextResponse.json({ ok: true, branchId });
}
