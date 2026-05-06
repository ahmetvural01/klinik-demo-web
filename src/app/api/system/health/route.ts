import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      database: "ok",
      uptimeSec: Math.floor(process.uptime()),
      responseMs: Date.now() - started,
      at: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({
      status: "degraded",
      database: "error",
      responseMs: Date.now() - started,
      at: new Date().toISOString(),
    }, { status: 503 });
  }
}
