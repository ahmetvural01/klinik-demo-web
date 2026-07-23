import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildAuditWhere } from "@/lib/audit-query";

const MAX_ROWS = 20000;

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[";\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const where = buildAuditWhere(searchParams);

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
    select: {
      createdAt: true,
      action: true,
      detail: true,
      ip: true,
      isGhost: true,
      actorRole: true,
      user: { select: { fullName: true, role: true, institution: { select: { name: true } } } },
    },
  });

  const header = ["Tarih", "Kullanıcı", "Klinik", "Rol", "İşlem", "Detay", "IP", "Ghost"];
  const rows = logs.map((l) => [
    l.createdAt.toLocaleString("tr-TR"),
    l.user?.fullName ?? "",
    l.user?.institution?.name ?? "",
    l.actorRole ?? l.user?.role ?? "",
    l.action,
    l.detail ?? "",
    l.ip ?? "",
    l.isGhost ? "Evet" : "Hayır",
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(";")).join("\r\n");
  // Excel'in Türkçe karakterleri doğru göstermesi için UTF-8 BOM eklenir.
  const bom = "﻿";

  await writeAudit(auth.user.id, "SUPERADMIN_AUDIT_EXPORT", `Denetim günlüğü CSV olarak dışa aktarıldı (${logs.length} kayıt)`);

  return new NextResponse(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="denetim-gunlugu-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
