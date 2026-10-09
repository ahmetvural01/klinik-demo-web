import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { requireActiveBranch } from "@/lib/branch-context";
import { listPatientIdsForDerivedBucket } from "@/lib/sms-consent-stats";

// SMS izin özeti — sayılar, tıklanınca açılan Hastalar listesiyle AYNI ölçütü
// kullanır: aktif şubenin arşivlenmemiş hastaları (bkz. api/patients/route.ts).
// Önceden kurum geneli ve arşivli hastalar da sayılıyor, hiç izin istenmemiş
// hastalar ise hiçbir kutuda görünmüyordu (NONE).
export async function GET() {
  const auth = await requireAuth("sms:read");
  if (auth.error) return auth.error;
  const institutionId = auth.user.institutionId;
  if (!institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları erişebilir." }, { status: 403 });
  }
  const activeBranch = requireActiveBranch(auth.user.branchContext);
  if (!activeBranch.ok) return NextResponse.json({ message: activeBranch.message }, { status: 403 });

  const scope = { institutionId, homeBranchId: activeBranch.branchId, archivedAt: null };
  const [total, enabled, disabled, none, pendingIds, expiredIds, failedIds] = await Promise.all([
    prisma.patient.count({ where: scope }),
    prisma.patient.count({ where: { ...scope, smsPreference: { is: { status: "ENABLED" } } } }),
    prisma.patient.count({ where: { ...scope, smsPreference: { is: { status: "DISABLED" } } } }),
    prisma.patient.count({ where: { ...scope, smsPreference: { is: null } } }),
    listPatientIdsForDerivedBucket(institutionId, "PENDING"),
    listPatientIdsForDerivedBucket(institutionId, "EXPIRED"),
    listPatientIdsForDerivedBucket(institutionId, "SEND_FAILED"),
  ]);

  const countInScope = (ids: string[]) => (ids.length === 0
    ? Promise.resolve(0)
    : prisma.patient.count({ where: { ...scope, id: { in: ids } } }));
  const [pending, expired, sendFailed] = await Promise.all([
    countInScope(pendingIds),
    countInScope(expiredIds),
    countInScope(failedIds),
  ]);

  return NextResponse.json({
    total,
    summary: { ENABLED: enabled, DISABLED: disabled, PENDING: pending, EXPIRED: expired, SEND_FAILED: sendFailed, NONE: none },
  });
}
