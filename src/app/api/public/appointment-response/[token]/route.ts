import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { getConfirmPageState, recordPatientResponse } from "@/lib/appointment-confirm";

type Params = { params: Promise<{ token: string }> };

/** Hatırlatmadaki onay bağlantısı: randevu bilgisi (oturumsuz). */
export async function GET(request: NextRequest, props: Params) {
  const { token } = await props.params;
  const ip = getClientIpFromHeaders(request.headers);
  const rate = await checkRateLimit(`appt-response-view:${ip}`, 30, 15 * 60_000);
  if (!rate.ok) return NextResponse.json({ message: "Çok fazla deneme. Biraz sonra yeniden deneyin." }, { status: 429 });
  const state = await getConfirmPageState(token);
  if (!state.ok) return NextResponse.json({ message: "Bu bağlantı geçersiz." }, { status: 404 });
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}

/** Hastanın yanıtı: { response: "GELECEK" | "GELEMEYECEK" }. */
export async function POST(request: NextRequest, props: Params) {
  const { token } = await props.params;
  const ip = getClientIpFromHeaders(request.headers);
  const rate = await checkRateLimit(`appt-response-submit:${ip}`, 10, 15 * 60_000);
  if (!rate.ok) return NextResponse.json({ message: "Çok fazla deneme. Biraz sonra yeniden deneyin." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { response?: unknown } | null;
  const response = body?.response === "GELECEK" || body?.response === "GELEMEYECEK" ? body.response : null;
  if (!response) return NextResponse.json({ message: "Geçersiz yanıt" }, { status: 400 });
  const result = await recordPatientResponse(token, response);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json({ ok: true, response: result.response });
}
