import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";

function safeParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isAllowedUrl(url: string) {
  return url.startsWith("https://api.netgsm.com.tr/") || url.startsWith("https://api.iletimerkezi.com/");
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const body = await request.json() as {
    url?: string;
    method?: string;
    headers?: string;
    payload?: string;
  };

  if (!body.url || !isAllowedUrl(body.url)) {
    return NextResponse.json({
      message: "Guvenlik nedeniyle sadece onayli SMS API hostlarina istek atilabilir",
    }, { status: 400 });
  }

  const method = (body.method || "GET").toUpperCase();
  const headers = body.headers ? safeParseJson(body.headers) : {};

  if (body.headers && !headers) {
    return NextResponse.json({ message: "Headers JSON formati gecersiz" }, { status: 400 });
  }

  const init: RequestInit = {
    method,
    headers: headers as HeadersInit,
  };

  if (method !== "GET" && body.payload) {
    init.body = body.payload;
  }

  const response = await fetch(body.url, init);
  const text = await response.text();

  return NextResponse.json({
    status: response.status,
    ok: response.ok,
    response: text,
  });
}
