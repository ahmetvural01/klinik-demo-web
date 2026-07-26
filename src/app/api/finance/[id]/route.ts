import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";

async function legacyWriteRouteRemoved() {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;

  return NextResponse.json(
    {
      message: "Bu eski ödeme uç noktası kullanımdan kaldırıldı. Tahsilat işlemleri Muhasebe Merkezi üzerinden yönetilmelidir.",
    },
    { status: 410 },
  );
}

export const GET = legacyWriteRouteRemoved;
export const PUT = legacyWriteRouteRemoved;
export const DELETE = legacyWriteRouteRemoved;
