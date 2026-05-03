import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// Bu endpoint manuel veya bir cron job ile çağrılabilir.
// Örnek: vercel.json crons, ya da bir zamanlanmış görev ile her gün çağrılır.
export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const now = new Date();

  // PENDING durumundaki ve vadesi geçmiş faturaları OVERDUE yap
  const result = await prisma.invoice.updateMany({
    where: {
      status: "PENDING",
      dueDate: { lt: now },
    },
    data: { status: "OVERDUE" },
  });

  return NextResponse.json({
    updated: result.count,
    message: `${result.count} fatura OVERDUE olarak işaretlendi`,
  });
}

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const now = new Date();

  // Kaç fatura gecikmiş durumda sayılabilir (önizleme)
  const overdueCount = await prisma.invoice.count({
    where: {
      status: "PENDING",
      dueDate: { lt: now },
    },
  });

  return NextResponse.json({ pendingOverdue: overdueCount });
}
