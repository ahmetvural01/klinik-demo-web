import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { getBillingStatus } from "@/lib/billing";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  if (auth.user.role === "SUPERADMIN" || !auth.user.institutionId) {
    return NextResponse.json({ nextDueDate: null, daysUntilDue: null, isRestricted: false, restrictedNote: null });
  }

  const status = await getBillingStatus(auth.user.institutionId);
  return NextResponse.json(status);
}
