"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import { Button } from "@/components/ui/Button";
import { cachedGet } from "@/lib/client-cache";
import { showToastSafe } from "@/lib/toast-client";
import type { StaffLike } from "@/lib/staff-roles";

type TaskType = "PARCA_SIPARIS" | "LAB" | "DIGER";

type ManagerRequestButtonProps = {
  /** Düğme metni, ör. "Yöneticiden sipariş iste". */
  label: string;
  /** Açılacak ekip görevinin başlığı. */
  taskTitle: string;
  taskDetails?: string;
  taskType?: TaskType;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "ghost";
};

function newTaskRequestKey() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `yonetici-istek-${random}`;
}

/** Yöneticiye istek (ekip görevi) gönderir; görev kurumun yöneticilerine atanır. Başarıda true. */
export async function sendManagerRequest({ taskTitle, taskDetails, taskType = "DIGER", requestKey = newTaskRequestKey() }: {
  taskTitle: string;
  taskDetails?: string;
  taskType?: TaskType;
  /** Aynı anahtar ağ hatasından sonra yeniden gönderilirse ikinci görev açılmaz. */
  requestKey?: string;
}): Promise<boolean> {
  // Personel listesi okunamazsa görev atanmadan açılır (Ekip görevlerinde görünür).
  const staff = await cachedGet<StaffLike[]>("/api/staff", 60_000, { throwOnError: true }).catch(() => null);
  const managerIds = (staff || []).filter((member) => member.role === "YONETICI" && member.isActive !== false).map((member) => member.id);
  const response = await fetch("/api/clinic-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
    body: JSON.stringify({
      title: taskTitle.slice(0, 180),
      ...(taskDetails ? { details: taskDetails.slice(0, 3000) } : {}),
      type: taskType,
      priority: 2,
      ...(managerIds.length > 0 ? { assignedToIds: managerIds } : {}),
    }),
  }).catch(() => null);
  if (!response) {
    showToastSafe({ title: "İstek gönderilemedi", message: "Bağlantı kurulamadı, tekrar deneyin.", type: "error" });
    return false;
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    showToastSafe({ title: "İstek gönderilemedi", message: body?.message || body?.error || "Görev açılamadı, tekrar deneyin.", type: "error" });
    return false;
  }
  showToastSafe({
    title: "Yöneticiye iletildi",
    message: managerIds.length > 0 ? "Görev yöneticinin görev listesine düştü." : "Görev Aramalar ve görevler › Ekip görevleri'ne eklendi.",
    type: "success",
  });
  return true;
}

/**
 * Yöneticinin yapması gereken bir iş için (laboratuvar tanımlama, partisiz stok,
 * sipariş) tek dokunuşla ekip görevi açar; görev kurumun yöneticilerine atanır.
 * Önceden ekranda yalnız "yöneticinize bildirin" yazıyordu; personel ayrıca
 * görev formunu açıp yazmak zorundaydı. Görev oluşturma izni (clinictasks:write)
 * olmayana ve yöneticinin kendisine düğme görünmez. Aynı istek anahtarı, ağ
 * hatasından sonra yeniden basılınca ikinci görev açılmasını önler.
 */
export function ManagerRequestButton({ label, taskTitle, taskDetails, taskType = "DIGER", size = "sm", variant = "secondary" }: ManagerRequestButtonProps) {
  const { can, role } = usePermissions();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const requestKeyRef = useRef("");

  if (!can("clinictasks:write") || role === "YONETICI" || role === "SUPERADMIN") return null;

  const send = async () => {
    if (state !== "idle") return;
    setState("sending");
    if (!requestKeyRef.current) requestKeyRef.current = newTaskRequestKey();
    const ok = await sendManagerRequest({ taskTitle, taskDetails, taskType, requestKey: requestKeyRef.current });
    setState(ok ? "sent" : "idle");
  };

  return (
    <Button
      size={size}
      variant={variant}
      icon={Send}
      loading={state === "sending"}
      disabled={state === "sent"}
      onClick={() => void send()}
    >
      {state === "sent" ? "Yöneticiye iletildi" : label}
    </Button>
  );
}
