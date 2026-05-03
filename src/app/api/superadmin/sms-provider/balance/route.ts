import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { testProviderBalance } from "@/lib/sms";

function parseBalance(raw: string): string | null {
  const text = raw.trim();

  const numericOnly = text.match(/^(\d+(?:[.,]\d+)?)$/);
  if (numericOnly) return numericOnly[1];

  const xmlTag = text.match(/<balance>([^<]+)<\/balance>/i);
  if (xmlTag) return xmlTag[1].trim();

  const generic = text.match(/(\d+(?:[.,]\d+)?)/);
  return generic ? generic[1] : null;
}

export async function POST(request: Request) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const body = await request.json() as { providerId?: string };

  if (!body.providerId) {
    return NextResponse.json({ message: "providerId zorunlu" }, { status: 400 });
  }

  const result = await testProviderBalance(body.providerId);

  return NextResponse.json({
    ok: result.success,
    balance: result.balance || parseBalance(result.raw),
    raw: result.raw,
    error: result.error,
  });
}
