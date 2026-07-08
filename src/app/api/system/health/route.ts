import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const HEALTH_CACHE_TTL_MS = 30_000;
const HEALTH_PROBE_TIMEOUT_MS = 250;

type HealthPayload = {
  status: "ok" | "degraded";
  database: "ok" | "error";
  uptimeSec: number;
  responseMs: number;
  at: string;
};

let healthCache: { payload: HealthPayload; expiresAt: number } | null = null;

export async function GET() {
  const started = Date.now();

  if (healthCache && healthCache.expiresAt > Date.now()) {
    return NextResponse.json(healthCache.payload, { status: healthCache.payload.status === "ok" ? 200 : 503 });
  }

  try {
    const probe = prisma.$queryRaw`SELECT 1`;
    const outcome = await Promise.race<"ok" | "error" | "timeout">([
      probe.then((): "ok" => "ok").catch((): "error" => "error"),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), HEALTH_PROBE_TIMEOUT_MS)),
    ]);

    if (outcome === "ok") {
      const payload: HealthPayload = {
        status: "ok",
        database: "ok",
        uptimeSec: Math.floor(process.uptime()),
        responseMs: Date.now() - started,
        at: new Date().toISOString(),
      };
      healthCache = { payload, expiresAt: Date.now() + HEALTH_CACHE_TTL_MS };
      return NextResponse.json(payload);
    }

    const payload: HealthPayload = {
      status: "degraded",
      uptimeSec: Math.floor(process.uptime()),
      responseMs: Date.now() - started,
      at: new Date().toISOString(),
      database: "error",
    };
    healthCache = { payload, expiresAt: Date.now() + 5_000 };
    return NextResponse.json(payload, { status: 503 });
  } catch {
    const payload: HealthPayload = {
      status: "degraded",
      database: "error",
      responseMs: Date.now() - started,
      at: new Date().toISOString(),
      uptimeSec: Math.floor(process.uptime()),
    };
    healthCache = { payload, expiresAt: Date.now() + 5_000 };
    return NextResponse.json(payload, { status: 503 });
  }
}
