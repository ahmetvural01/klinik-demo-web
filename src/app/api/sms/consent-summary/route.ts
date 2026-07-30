import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { computeSmsConsentSummary } from "@/lib/sms-consent-stats";

export async function GET() {
  const auth = await requireAuth("sms:read");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları erişebilir." }, { status: 403 });
  }

  const summary = await computeSmsConsentSummary(auth.user.institutionId);
  return NextResponse.json({ summary });
}
