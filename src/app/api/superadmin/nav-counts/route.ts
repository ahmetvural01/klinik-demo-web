import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Platform yönetimi sol menüsündeki iş kuyruğu sayaçları: yanıt bekleyen
// destek talebi ve vadesi geçmiş açık fatura. Yalnız iki sayım yapar; menü
// her sayfa değişiminde çağırır.
export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const now = new Date();
  const [openSupport, overdueInvoices] = await Promise.all([
    prisma.supportTicket.count({ where: { answer: null, status: { not: "CLOSED" } } }),
    prisma.invoice.count({ where: { status: { in: ["PENDING", "OVERDUE"] }, dueDate: { lt: now } } }),
  ]);

  return NextResponse.json({ openSupport, overdueInvoices });
}
