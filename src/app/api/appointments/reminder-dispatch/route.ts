import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withApiTiming } from "@/lib/api";
import { runAppointmentReminderSweep } from "@/lib/appointment-reminders";

export const POST = withApiTiming("reminder-dispatch", async function POST(request: NextRequest) {
  const auth = await requireAuth("sms:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json(
      { message: "Yalnızca klinik kullanıcıları hatırlatma gönderebilir." },
      { status: 403 },
    );
  }

  const requestedTake = Number(request.nextUrl.searchParams.get("take") || 25);
  const result = await runAppointmentReminderSweep({
    institutionId: auth.user.institutionId,
    take: Number.isFinite(requestedTake) ? requestedTake : 25,
  });
  return NextResponse.json(result);
});
