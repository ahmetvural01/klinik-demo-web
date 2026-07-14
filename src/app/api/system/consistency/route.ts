import { NextResponse } from "next/server";
import { requireAuth, withApiTiming } from "@/lib/api";
import { buildDataConsistencyReport } from "@/lib/data-consistency";

export const GET = withApiTiming("system_consistency", async function GET() {
  const auth = await requireAuth("audit:read");
  if (auth.error) return auth.error;

  const report = await buildDataConsistencyReport(auth.user.institutionId);

  return NextResponse.json(report);
});
