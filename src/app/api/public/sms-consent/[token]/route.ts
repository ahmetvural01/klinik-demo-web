import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { submitConsentDecision, validateConsentToken } from "@/lib/sms-consent";

const STATUS_MESSAGES: Record<"NOT_FOUND" | "USED" | "EXPIRED" | "SUPERSEDED", string> = {
  NOT_FOUND: "Bu bağlantı geçersiz.",
  USED: "Bu bağlantı daha önce kullanılmış.",
  EXPIRED: "Bu bağlantının süresi dolmuş. Kliniğinizden tekrar SMS göndermesini isteyebilirsiniz.",
  SUPERSEDED: "Bu bağlantı artık geçerli değil — kliniğiniz size yeni bir onay bağlantısı göndermiş. Lütfen en son gelen SMS'i kullanın.",
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIpFromHeaders(request.headers);
  const rate = checkRateLimit(`sms-consent-view:${ip}`, 30, 15 * 60_000);
  if (!rate.ok) {
    return NextResponse.json({ message: "Çok fazla istek gönderildi. Lütfen kısa bir süre sonra tekrar deneyin." }, { status: 429 });
  }

  const result = await validateConsentToken(token);
  if (!result.ok) {
    return NextResponse.json({ message: STATUS_MESSAGES[result.status] }, { status: 410 });
  }
  return NextResponse.json({ institutionName: result.institutionName, patientInitial: result.patientInitial });
}

const decisionSchema = z.object({ decision: z.enum(["ENABLED", "DISABLED"]) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIpFromHeaders(request.headers);
  const rate = checkRateLimit(`sms-consent-submit:${ip}`, 10, 15 * 60_000);
  if (!rate.ok) {
    return NextResponse.json({ message: "Çok fazla istek gönderildi. Lütfen kısa bir süre sonra tekrar deneyin." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Geçersiz istek." }, { status: 400 });
  }

  const result = await submitConsentDecision({
    rawToken: token,
    decision: parsed.data.decision,
    ip,
    userAgent: request.headers.get("user-agent"),
  });

  if (!result.ok) {
    return NextResponse.json({ message: STATUS_MESSAGES[result.status] }, { status: 410 });
  }
  return NextResponse.json({ ok: true });
}
