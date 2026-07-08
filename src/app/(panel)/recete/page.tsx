"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { formatDate } from "@/lib/format";

type Setting = {
  institutionName?: string | null;
  institutionAddress?: string | null;
  institutionPhone?: string | null;
};

type Prescription = {
  id: string;
  drugs: string; // JSON stringify: [{ name, dose, usage, duration, note }]
  note?: string | null;
  createdAt: string;
};

type Patient = {
  id: string;
  fullName: string;
  tcNo: string;
  birthDate?: string | null;
  gender: string;
  phone?: string | null;
  address?: string | null;
  insurance?: string | null;
};

export default function PrescriptionPage() {
  const search = useSearchParams();
  const prescriptionId = search.get("id") || "";
  const patientId = search.get("patientId") || "";

  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [setting, setSetting] = useState<Setting | null>(null);
  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState("");
  const hidePhone = userRole === "DOKTOR" || userRole === "ASISTAN";

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => {
        const preview = typeof window !== "undefined" ? sessionStorage.getItem("dev-preview-role") : null;
        setUserRole(preview || d?.role || "");
      })
      .catch(() => {});
    const onPreview = () => {
      const preview = sessionStorage.getItem("dev-preview-role");
      fetch("/api/auth/me").then(r => r.json()).then(d => setUserRole(preview || d?.role || "")).catch(() => {});
    };
    window.addEventListener("preview-role-change", onPreview);
    return () => window.removeEventListener("preview-role-change", onPreview);
  }, []);

  const load = async () => {
    if (!prescriptionId || !patientId) return;
    setLoading(true);
    try {
      const [prescRes, patRes, settingRes] = await Promise.all([
        fetch(`/api/prescriptions/${prescriptionId}`),
        fetch(`/api/patients/${patientId}`),
        fetch("/api/settings"),
      ]);

      if (prescRes.ok) {
        const presc = await prescRes.json();
        setPrescription(presc);
      }

      if (patRes.ok) {
        const pat = await patRes.json();
        setPatient(pat);
      }

      if (settingRes.ok) {
        const st = await settingRes.json();
        setSetting(st);
      }
    } catch (error) {
      console.error("Reçete yükleme hatası:", error);
    }
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void load();
  }, [prescriptionId, patientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!prescription || !patient) {
    return (
      <div className="rounded-xl border border-slate-100 bg-white p-6 text-center">
        <p className="text-slate-600">Reçete bulunamadı</p>
        <Link href="/hasta-detay" className="mt-2 inline-block text-sm text-primary hover:underline">
          Geri dön
        </Link>
      </div>
    );
  }

  const handlePrint = () => {
    const drugsHtml = printableDrugs.length === 0
      ? `<li style="color:#9ca3af;font-style:italic">Reçeteye ilaç eklenmemiş.</li>`
      : printableDrugs.map((d, i) => `
        <li style="border-bottom:1px dashed #e2e8f0;padding-bottom:8px;margin-bottom:8px">
          <div style="font-size:11px;font-weight:700;color:#1e293b">${i+1}. ${d.name}</div>
          <div style="font-size:10px;color:#475569;margin-top:2px">${[d.dose, d.usage, d.duration].filter(Boolean).join(" · ")}</div>
          ${d.note ? `<div style="font-size:9px;color:#94a3b8;font-style:italic;margin-top:1px">Not: ${d.note}</div>` : ""}
        </li>`).join("");
    const noteHtml = prescription.note ? `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:4px;padding:8px;margin:10px 0">
        <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;color:#92400e;margin-bottom:3px">Tanı / Doktor Notu</div>
        <div style="font-size:10px;color:#92400e">${prescription.note}</div>
      </div>` : "";
    const fillerLines = Array.from({ length: 5 })
      .map(() => `<div class="rx-line"></div>`)
      .join("");
    const age = patient.birthDate ? Math.floor((Date.now() - new Date(patient.birthDate).getTime()) / 31536000000) : null;
    const el = document.getElementById("ks-rx-print-area");
    if (!el) return;
    el.innerHTML = `<div class="rx-page"><div class="rx-frame">
      <div class="rx-header">
        <div><div class="rx-clinic">${clinicName}</div><div class="rx-sub">${clinicAddress} · ${clinicPhone}</div></div>
        <div class="rx-right"><div class="rx-label">REÇETE</div><div class="rx-date">${formatDate(prescription.createdAt)}</div></div>
      </div>
      <div class="rx-patient">
        <span><strong>${patient.fullName}</strong></span>
        <span>T.C.: <strong>${patient.tcNo}</strong></span>
        <span>${(patient.gender==="ERKEK"||patient.gender==="M")?"Erkek":"Kadın"}${age ? `, ${age} yaş` : ""}</span>
        ${patient.birthDate ? `<span>D.T.: <strong>${new Date(patient.birthDate).toLocaleDateString("tr-TR")}</strong></span>` : ""}
        ${!hidePhone && patient.phone ? `<span>Tel: <strong>${patient.phone}</strong></span>` : ""}
      </div>
      <div class="rx-content">
        <div class="rx-drugs-title">İlaç Listesi</div>
        <ol>${drugsHtml}</ol>
        ${noteHtml}
        <div class="rx-extra-notes">
          <div class="rx-extra-title">Ek Klinik Not Alanı</div>
          ${fillerLines}
        </div>
      </div>
      <div class="rx-footer"><div class="rx-sign"><div class="rx-sign-line">Hekim İmza / Kaşe</div></div></div>
    </div></div>`;
    setTimeout(() => {
      window.print();
      setTimeout(() => { el.innerHTML = ""; }, 1000);
    }, 150);
  };

  const parseDrugs = () => {
    try {
      const parsed = JSON.parse(prescription.drugs || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return String(prescription.drugs || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ name: line, dose: "", usage: "", duration: "", note: "" }));
    }
  };

  const printableDrugs = parseDrugs();
  const clinicName = setting?.institutionName || "Klinik Modern";
  const clinicAddress = setting?.institutionAddress || "Açık adres bilgisi girilmemiş";
  const clinicPhone = setting?.institutionPhone || "Telefon bilgisi girilmemiş";

  return (
    <section className="space-y-5">
      {/* Kontrol Barı */}
      <div className="flex items-center justify-between gap-3">
        <Link href={`/hasta-detay?id=${patientId}`} className="text-sm text-slate-600 hover:text-slate-900">
          ← Hasta kartına dön
        </Link>
        <button
          onClick={handlePrint}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition print:hidden"
        >
          Yazdır
        </button>
      </div>

      <div className="mx-auto w-full max-w-[148mm] min-h-[210mm] rounded-xl border border-slate-200 bg-white shadow-sm print:shadow-none print:border-0 print:p-0">
        <div className="p-5 min-h-[calc(210mm-10mm)] flex flex-col">

          {/* Klinik Başlığı */}
          <div className="flex items-start justify-between border-b border-[#0f3b78] pb-3 mb-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Diş Kliniği</div>
              <h1 className="text-base font-bold text-[#0f3b78] leading-tight">{clinicName}</h1>
              <p className="text-xs text-slate-500 mt-0.5">{clinicAddress}</p>
              <p className="text-xs text-slate-500">{clinicPhone}</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-black tracking-widest text-[#0f3b78]">REÇETE</div>
              <div className="text-xs text-slate-500 mt-0.5">Tarih: {formatDate(prescription.createdAt)}</div>
            </div>
          </div>

          {/* Hasta Bilgileri */}
          <div className="rounded border border-slate-200 bg-slate-50 p-2.5 mb-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
              <div><span className="text-slate-400">Ad Soyad: </span><span className="font-semibold text-slate-800">{patient.fullName}</span></div>
              <div><span className="text-slate-400">T.C. No: </span><span className="text-slate-700">{patient.tcNo}</span></div>
              <div><span className="text-slate-400">Cinsiyet: </span><span className="text-slate-700">{(patient.gender === "ERKEK" || patient.gender === "M") ? "Erkek" : "Kadın"}</span></div>
              <div><span className="text-slate-400">Doğum Tarihi: </span><span className="text-slate-700">{patient.birthDate ? new Date(patient.birthDate).toLocaleDateString("tr-TR") : "—"}</span></div>
              {!hidePhone && patient.phone && <div><span className="text-slate-400">Telefon: </span><span className="text-slate-700">{patient.phone}</span></div>}
              {patient.address && <div className="col-span-2"><span className="text-slate-400">Adres: </span><span className="text-slate-700">{patient.address}</span></div>}
            </div>
          </div>

          {/* İlaçlar */}
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#0f3b78] border-b border-[#0f3b78] pb-1 mb-2">İlaçlar</div>
            <ol className="space-y-2.5">
              {printableDrugs.length === 0 && (
                <li className="text-xs text-slate-400 italic">Reçeteye ilaç eklenmemiş.</li>
              )}
              {printableDrugs.map((drug, idx) => (
                <li key={idx} className="border-b border-dashed border-slate-200 pb-2">
                  <p className="text-sm font-semibold text-slate-900">{idx + 1}. {drug.name}</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {drug.dose ? `${drug.dose}` : ""}
                    {drug.dose && drug.usage ? " · " : ""}
                    {drug.usage || ""}
                    {drug.duration ? ` · ${drug.duration}` : ""}
                  </p>
                  {drug.note ? <p className="text-xs italic text-slate-400 mt-0.5">Not: {drug.note}</p> : null}
                </li>
              ))}
            </ol>
          </div>

          {/* Doktor Notu */}
          {prescription.note && (
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2.5">
              <p className="text-xs font-semibold uppercase text-amber-800 mb-1">Tanı / Doktor Notu</p>
              <p className="text-xs text-amber-800">{prescription.note}</p>
            </div>
          )}

          {/* İmza Alanı — sayfa altı, minimal */}
          <div className="mt-auto pt-6">
            <div className="flex justify-end">
              <div className="text-center" style={{minWidth: "120px"}}>
                <div className="border-t border-slate-400 pt-1">
                  <p className="text-xs text-slate-400">Diş Hekimi İmza / Kaşe</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Print Stil — A5 için sayfa ayarı */}
      <div id="ks-rx-print-area" />
      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          #ks-rx-print-area { visibility: visible !important; display: block !important; position: fixed !important; top: 0; left: 0; width: 100%; background: white; z-index: 99999; }
          #ks-rx-print-area * { visibility: visible !important; }
          @page { size: A5 portrait; margin: 5mm; }
          #ks-rx-print-area .rx-page { width: 100%; min-height: 199mm; margin: 0 auto; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1e293b; display: flex; flex-direction: column; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          #ks-rx-print-area .rx-frame { border: 1.5px solid #1e3a5f; min-height: 199mm; display: flex; flex-direction: column; }
          #ks-rx-print-area .rx-header { background: #1e3a5f !important; color: #fff !important; padding: 8px 12px; display: flex; justify-content: space-between; align-items: flex-start; }
          #ks-rx-print-area .rx-clinic { font-size: 13px; font-weight: 700; letter-spacing: 0.3px; }
          #ks-rx-print-area .rx-sub { font-size: 8.5px; opacity: 0.75; margin-top: 2px; }
          #ks-rx-print-area .rx-right { text-align: right; }
          #ks-rx-print-area .rx-label { font-size: 15px; font-weight: 900; letter-spacing: 2px; }
          #ks-rx-print-area .rx-date { font-size: 8.5px; opacity: 0.8; margin-top: 2px; }
          #ks-rx-print-area .rx-patient { background: #f1f5f9 !important; border-bottom: 1px solid #e2e8f0; padding: 6px 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; font-size: 9.5px; color: #475569; }
          #ks-rx-print-area .rx-patient strong { color: #1e293b; }
          #ks-rx-print-area .rx-content { padding: 10px 12px; flex: 1; }
          #ks-rx-print-area .rx-drugs-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #1e3a5f; border-bottom: 1px solid #1e3a5f; padding-bottom: 3px; margin-bottom: 8px; }
          #ks-rx-print-area ol { list-style: none; padding: 0; }
          #ks-rx-print-area .rx-extra-notes { margin-top: 12px; }
          #ks-rx-print-area .rx-extra-title { font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 3px; }
          #ks-rx-print-area .rx-line { border-bottom: 1px dashed #cbd5e1; height: 16px; }
          #ks-rx-print-area .rx-footer { margin-top: auto; border-top: 1px solid #e2e8f0; padding: 5px 12px; display: flex; justify-content: flex-end; background: #f8fafc !important; }
          #ks-rx-print-area .rx-sign { text-align: center; min-width: 110px; }
          #ks-rx-print-area .rx-sign-line { border-top: 1px solid #94a3b8; padding-top: 3px; font-size: 8px; color: #94a3b8; margin-top: 22px; }
        }
      `}</style>
    </section>
  );
}
