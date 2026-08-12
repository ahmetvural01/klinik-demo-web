import { NextResponse } from "next/server";
import { requireAuth, withApiTiming } from "@/lib/api";
import { buildDataConsistencyReport } from "@/lib/data-consistency";
import { requireActiveBranch } from "@/lib/branch-context";

export const GET = withApiTiming("system_consistency", async function GET() {
  const auth = await requireAuth("audit:read");
  if (auth.error) return auth.error;
  const branch = requireActiveBranch(auth.user.branchContext);
  if (!branch.ok) return NextResponse.json({ message: branch.message }, { status: 403 });

  const report = await buildDataConsistencyReport(auth.user.institutionId, branch.branchId);

  return NextResponse.json(report);
});
