import { NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { testProviderSend } from "@/lib/sms";

export async function POST(request: Request) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const body = await request.json() as {
    providerId?: string;
    phone?: string;
    message?: string;
  };

  if (!body.providerId || !body.phone || !body.message) {
    return NextResponse.json({ message: "providerId, phone ve message zorunlu" }, { status: 400 });
  }

  const result = await testProviderSend(body.providerId, body.phone, body.message);
  await writeAudit(auth.user.id, "SUPERADMIN_SMS_PROVIDER_TEST_SEND", `SMS test gönderimi: ${body.phone} / ${result.success ? "başarılı" : "başarısız"} / ${result.providerCode || body.providerId}`);

  return NextResponse.json({
    ok: result.success,
    providerCode: result.providerCode,
    raw: result.providerRaw,
    error: result.error,
    providerMessageId: result.providerMessageId,
  });
}
