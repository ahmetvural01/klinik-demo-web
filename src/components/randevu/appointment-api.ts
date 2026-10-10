"use client";

import { confirmDialog } from "@/lib/confirm-client";
import type { Appointment } from "@/components/randevu/appointment-utils";

/**
 * Randevu ekranlarının (takvim, anasayfa) sunucuyla konuştuğu TEK yer.
 * Önceden aynı istekler sayfanın içinde üç-dört kez ayrı ayrı yazılıyordu.
 * Hata iletisi boşsa (status 409, message "") kullanıcı onayı reddetmiştir;
 * çağıran bir şey göstermez.
 */

export type ApiResult<T = unknown> = { ok: true; data: T } | { ok: false; message: string; status: number };

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  return (await response.json().catch(() => null)) as Record<string, unknown> | null;
}

function messageOf(body: Record<string, unknown> | null, fallback: string): string {
  const text = body?.message ?? body?.error;
  return typeof text === "string" && text.trim() ? text : fallback;
}

/**
 * Doktor çakışması sert bir engel değil — sunucu 409 + requiresConfirmation
 * döndürürse personele sorulur, onaylarsa overrideConflict:true ile aynı istek
 * tekrar gönderilir. Tedavi alanı/hasta çakışmaları kesin engel olarak kalır.
 */
export async function saveAppointment(url: string, method: "POST" | "PUT", body: Record<string, unknown>): Promise<ApiResult<Appointment & { smsStatus?: Record<string, string> }>> {
  const send = (payload: Record<string, unknown>) =>
    fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  try {
    let response = await send(body);
    let data = await readJson(response);
    if (response.status === 409 && data?.requiresConfirmation) {
      const confirmed = await confirmDialog({
        title: "Doktorun bu saatte başka randevusu var",
        message: messageOf(data, "Bu doktorun aynı saatte başka bir randevusu var. Yine de kaydedilsin mi?"),
        confirmText: "Yine de kaydet",
        cancelText: "Vazgeç",
      });
      if (!confirmed) return { ok: false, message: "", status: 409 };
      response = await send({ ...body, overrideConflict: true });
      data = await readJson(response);
    }
    if (!response.ok) return { ok: false, message: messageOf(data, "Randevu kaydedilemedi."), status: response.status };
    return { ok: true, data: data as unknown as Appointment & { smsStatus?: Record<string, string> } };
  } catch {
    return { ok: false, message: "Bağlantı kurulamadı. Bilgileriniz korundu; tekrar deneyin.", status: 0 };
  }
}

/**
 * Yalnız durum ve/veya not değişikliği (sunucu kısmi güncelleme yolu).
 * İptal edilen randevu yeniden açılırken doktorun aynı saatte başka randevusu
 * varsa sunucu onay ister (409 + requiresConfirmation) — kayıttaki kuralın aynısı.
 */
export async function patchAppointment(id: string, body: { status?: string; note?: string }): Promise<ApiResult<Appointment>> {
  const send = (payload: Record<string, unknown>) => fetch(`/api/appointments/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  try {
    let response = await send(body);
    let data = await readJson(response);
    if (response.status === 409 && data?.requiresConfirmation) {
      const confirmed = await confirmDialog({
        title: "Doktorun bu saatte başka randevusu var",
        message: messageOf(data, "Bu doktorun aynı saatte başka bir randevusu var. Yine de devam edilsin mi?"),
        confirmText: "Yine de yeniden aç",
        cancelText: "Vazgeç",
      });
      if (!confirmed) return { ok: false, message: "", status: 409 };
      response = await send({ ...body, overrideConflict: true });
      data = await readJson(response);
    }
    if (!response.ok) return { ok: false, message: messageOf(data, "Randevu güncellenemedi."), status: response.status };
    return { ok: true, data: data as unknown as Appointment };
  } catch {
    return { ok: false, message: "Bağlantı kurulamadı. Tekrar deneyin.", status: 0 };
  }
}

export type PatientContext = {
  notify: { canNotify: boolean; reason: string | null };
  nextAppointment: { id: string; startAt: string; doctorName: string | null; doctorId?: string | null } | null;
  contagious: { note: string | null } | null;
  /** Son tamamlanan randevunun hekimi (hekim önerisi); yoksa null. */
  lastAppointmentDoctorId?: string | null;
};

/** Randevu formu için seçili hastanın kısa bağlamı (mesaj gider mi, yaklaşan randevu, bulaşıcı hastalık, hekim önerisi). */
export async function fetchPatientContext(patientId: string, excludeAppointmentId: string | undefined, signal?: AbortSignal): Promise<PatientContext | null> {
  const params = new URLSearchParams({ patientId });
  if (excludeAppointmentId) params.set("excludeAppointmentId", excludeAppointmentId);
  const response = await fetch(`/api/appointments/patient-context?${params.toString()}`, { cache: "no-store", signal });
  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as PatientContext | null;
}

/** Online talebin kayıtlı hastası (TC ya da telefonla, sunucuda eşleştirilir). */
export async function fetchBookingRequestMatch(requestId: string, signal?: AbortSignal): Promise<{ id: string; fullName: string } | null> {
  const response = await fetch(`/api/booking-requests/${encodeURIComponent(requestId)}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Kayıtlı hasta aranamadı.");
  const data = (await response.json().catch(() => null)) as { patient?: { id: string; fullName: string } | null } | null;
  return data?.patient?.id ? { id: data.patient.id, fullName: data.patient.fullName } : null;
}

/**
 * Randevuyu iptal eder (kayıt silinmez). appointments:delete yetkisi varsa
 * DELETE, yalnız appointments:approve varsa durum IPTAL ile.
 */
export async function cancelAppointment(id: string, useDelete: boolean): Promise<ApiResult<null>> {
  if (!useDelete) {
    const result = await patchAppointment(id, { status: "IPTAL" });
    return result.ok ? { ok: true, data: null } : result;
  }
  try {
    const response = await fetch(`/api/appointments/${id}`, { method: "DELETE" });
    const data = await readJson(response);
    if (!response.ok) return { ok: false, message: messageOf(data, "Randevu iptal edilemedi."), status: response.status };
    return { ok: true, data: null };
  } catch {
    return { ok: false, message: "Bağlantı kurulamadı. Tekrar deneyin.", status: 0 };
  }
}

/** Online talebi oluşturulan randevuya bağlar (talep "onaylandı" olur). */
export async function linkBookingRequest(requestId: string, appointmentId: string): Promise<ApiResult<null>> {
  try {
    const response = await fetch(`/api/booking-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ONAYLANDI", appointmentId }),
    });
    const data = await readJson(response);
    if (!response.ok) return { ok: false, message: messageOf(data, "Online talep randevuya bağlanamadı."), status: response.status };
    return { ok: true, data: null };
  } catch {
    return { ok: false, message: "Bağlantı kurulamadı; online talep randevuya bağlanamadı.", status: 0 };
  }
}

/** Bekleme listesi kaydını oluşturulan randevuyla kapatır. */
export async function linkWaitlistEntry(entryId: string, appointmentId: string): Promise<ApiResult<null>> {
  try {
    const response = await fetch(`/api/waitlist/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "YERLESTIRILDI", appointmentId }),
    });
    const data = await readJson(response);
    if (!response.ok) return { ok: false, message: messageOf(data, "Bekleme listesi kaydı kapatılamadı."), status: response.status };
    return { ok: true, data: null };
  } catch {
    return { ok: false, message: "Bağlantı kurulamadı; bekleme listesi kaydı kapatılamadı.", status: 0 };
  }
}

/** Bir günün (ve isteğe bağlı doktorun) randevuları — form çakışma kontrolü için. */
export async function fetchDayAppointments(dateKey: string, doctorId?: string, signal?: AbortSignal): Promise<Appointment[]> {
  const params = new URLSearchParams({ date: dateKey });
  if (doctorId) params.set("doctorId", doctorId);
  const response = await fetch(`/api/appointments?${params.toString()}`, { cache: "no-store", signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(messageOf(data, "Günün randevuları yüklenemedi."));
  return Array.isArray(data) ? data : [];
}
