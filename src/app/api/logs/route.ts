import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth("audit:read");
    if (auth.error) return auth.error;

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from") || sp.get("start");
    const to = sp.get("to") || sp.get("end");
    const page = Math.max(1, parseInt(sp.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(sp.get("limit") || "15")));
    const q = sp.get("q") || "";
    const action = sp.get("action") || "";
    const category = sp.get("category") || "";

    const where: Record<string, unknown> = {};
    where.user = {
      role: { not: "SUPERADMIN" },
      ...(auth.user.role !== "SUPERADMIN" ? { institutionId: auth.user.institutionId } : {}),
    };
    where.NOT = [{ actorRole: "SUPERADMIN" }, { isGhost: true }];
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to + "T23:59:59.999Z") } : {})
      };
    }
    if (q) {
      where.OR = [
        { action: { contains: q, mode: "insensitive" } },
        { detail: { contains: q, mode: "insensitive" } },
        { user: { fullName: { contains: q, mode: "insensitive" } } }
      ];
    }
    if (action) {
      where.action = action;
    } else if (category) {
      const prefixes: Record<string, string[]> = {
        hasta: ["PATIENT_", "PATIENT_FOLLOW_UP", "DOCUMENT_", "PATIENT_CONSENT"],
        randevu: ["APPOINTMENT_", "BOOKING_REQUEST_", "PUBLIC_BOOKING_", "WAITLIST_", "DOCTOR_BLOCK_"],
        tedavi: ["EXAM_", "TREATMENT_", "PRESCRIPTION_"],
        finans: ["PAYMENT_", "KASA_", "GIDER_", "TAKSIT_", "FIRMA_", "PURCHASE_"],
        lab: ["LAB_"],
        stok: ["STOCK_"],
        ayar: ["SETTINGS_", "POS_", "PRICE_", "SMS_TEMPLATE_", "TREATMENT_TYPE_", "FOLLOW_UP_TYPES_"],
        sms: ["SMS_"],
        sistem: ["LOGIN", "LOGOUT", "PROFILE_", "PASSWORD_", "STAFF_", "MESSAGE_", "ANNOUNCEMENT_", "SUPPORT_", "DEV_", "DEMO_"],
      };
      const selected = prefixes[category] || [];
      if (selected.length > 0) {
        const categoryOr = selected.map((prefix) =>
          prefix.endsWith("_")
            ? { action: { startsWith: prefix } }
            : { action: prefix }
        );
        const searchOr = where.OR as unknown[] | undefined;
        if (searchOr?.length) {
          delete where.OR;
          where.AND = [{ OR: searchOr }, { OR: categoryOr }];
        } else {
          where.OR = categoryOr;
        }
      }
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          detail: true,
          createdAt: true,
          isGhost: true,
          actorId: true,
          actorRole: true,
          ip: true,
          user: { select: { id: true, fullName: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    const actorIds = Array.from(new Set(logs.map((log) => log.actorId).filter(Boolean))) as string[];
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true, role: true },
        })
      : [];
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));

    return NextResponse.json({
      logs: logs.map((log) => ({
        ...log,
        actor: log.actorId ? actorById.get(log.actorId) || null : null,
      })),
      total,
    });
  } catch (error) {
    console.error("[logs GET] fallback:", error);
    return NextResponse.json({ message: "İşlem kayıtları yüklenemedi." }, { status: 503 });
  }
}
