"use client";

import { useMemo, useState } from "react";
import { FormModal } from "@/components/ui/FormModal";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Switch } from "@/components/ui/Switch";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { formatDateText } from "@/components/ui/Money";
import { formatPhoneNumber } from "@/lib/format";
import { showToastSafe } from "@/lib/toast-client";
import { turkeyDateKey } from "@/lib/tz";
import { examStatusKind, isChargeableExamStatus } from "@/lib/examination-status";
import { LAB_STAGE_LABEL, getOrderSummary } from "@/lib/lab-workflow";
import { statusChipLabel } from "@/components/randevu/appointment-utils";
import { usePatientFile } from "./PatientFileContext";
import { appointmentTypeLabel, genderLabel, healthFlagsOf, money, paymentMethodLabel, type PatientBalance } from "./patient-file-shared";

type SectionKey = "profile" | "completedTreatments" | "plannedTreatments" | "payments" | "balance" | "appointments" | "labOrders" | "prescriptions" | "documents" | "notes";
type Format = "pdf" | "excel";
type Mode = "treatment" | "all" | "custom";
type Section = { title: string; headers: string[]; rows: (string | number)[][] };
type Raw = Record<string, unknown>;

/**
 * Bölümler ve görmek için gereken okuma yetkisi (biri yeterli). Yetkisi
 * olmayan bölüm listelenmez; sunucu da o bölümün verisini hiç döndürmez.
 */
const SECTIONS: { key: SectionKey; label: string; description: string; anyOf: string[] }[] = [
  { key: "profile", label: "Hasta bilgileri", description: "Kimlik, iletişim, sağlık uyarıları", anyOf: ["patients:read"] },
  { key: "completedTreatments", label: "Yapılan tedaviler", description: "Borca yansıyan tedaviler", anyOf: ["examinations:read"] },
  { key: "plannedTreatments", label: "Planlanan tedaviler", description: "Henüz yapılmamış, borca yansımayan tedaviler", anyOf: ["examinations:read"] },
  { key: "payments", label: "Tahsilatlar", description: "Tarih, tutar, yöntem, POS", anyOf: ["payments:read"] },
  { key: "balance", label: "Hesap özeti", description: "Tedavi toplamı, indirim, tahsilat, kalan", anyOf: ["payments:read", "finance:read"] },
  { key: "appointments", label: "Randevular", description: "Geçmiş ve gelecek randevular", anyOf: ["appointments:read"] },
  { key: "labOrders", label: "Laboratuvar", description: "Lab işleri, durumları, faturaları", anyOf: ["lab:read"] },
  { key: "prescriptions", label: "Reçeteler", description: "Yazılan ilaçlar ve notlar", anyOf: ["prescriptions:read"] },
  { key: "documents", label: "Belgeler ve onamlar", description: "Dosya listesi ve imzalı onamlar", anyOf: ["documents:read", "xray:read"] },
  { key: "notes", label: "Notlar", description: "Hasta notları", anyOf: ["patients:read"] },
];

const TREATMENT_SELECTION: SectionKey[] = ["profile", "completedTreatments", "plannedTreatments", "payments", "balance"];

const list = (value: unknown): Raw[] => (Array.isArray(value) ? (value as Raw[]) : []);
// Boş değer belgede her yerde aynı: "—".
const str = (value: unknown) => (value === null || value === undefined || value === "" ? "—" : String(value));
const date = (value: unknown) => (value ? formatDateText(String(value)) : "—");
const dateTime = (value: unknown) => (value ? formatDateText(String(value), "datetime") : "—");
const name = (value: unknown) => (value && typeof value === "object" && "fullName" in value ? str((value as Raw).fullName) : "—");

/** Telefon yazdırılan hasta belgeleriyle aynı biçimde: "(0555) 000-0110"; yurt dışı numara ülke koduyla. */
function phoneText(patient: Raw) {
  const phone = typeof patient.phone === "string" ? patient.phone.trim() : "";
  if (!phone) return "—";
  const code = typeof patient.phoneCountryCode === "string" ? patient.phoneCountryCode : "";
  return code && code !== "+90" ? `${code} ${phone}` : formatPhoneNumber(phone);
}

function drugText(raw: unknown) {
  try {
    const parsed = JSON.parse(String(raw || "")) as unknown;
    if (Array.isArray(parsed)) return parsed.map((drug) => [ (drug as Raw).name, (drug as Raw).dose ].filter(Boolean).join(" ")).join(", ");
  } catch {
    // düz metin
  }
  return str(raw);
}

function buildSections(patient: Raw, balance: PatientBalance, hidePhone: boolean, hideDoctor: boolean): Record<SectionKey, Section> {
  const exams = list(patient.examinations);
  const doctorCol = (row: Raw) => (hideDoctor ? [] : [name(row.doctor)]);
  const withDoctor = (headers: string[], at: number) => (hideDoctor ? headers : [...headers.slice(0, at), "Hekim", ...headers.slice(at)]);
  const health = healthFlagsOf(patient as unknown as Parameters<typeof healthFlagsOf>[0]).join(", ") || "Bilinen uyarı yok";

  return {
    profile: {
      title: "Hasta bilgileri",
      headers: ["Alan", "Değer"],
      rows: [
        ["Ad Soyad", str(patient.fullName)],
        ["TC kimlik no", hidePhone ? "***" : str(patient.tcNo)],
        ["Telefon", hidePhone ? "***" : phoneText(patient)],
        ["Cinsiyet", genderLabel(String(patient.gender || "")) || "—"],
        ["Doğum tarihi", date(patient.birthDate)],
        ["Kurum / sigorta", str(patient.insurance)],
        ["İndirim", `%${Number(patient.discountRate || 0)}`],
        ["Meslek", str(patient.profession)],
        ["Sağlık uyarıları", health],
        ["Kullandığı ilaçlar", str(patient.medications)],
        ["Geçirdiği ameliyatlar", str(patient.surgeries)],
        ["Diğer hastalıklar", str(patient.otherDiseases)],
      ],
    },
    completedTreatments: {
      title: "Yapılan tedaviler",
      headers: withDoctor(["Tarih", "Tedavi", "Diş", "Tutar"], 3),
      rows: exams.filter((exam) => isChargeableExamStatus(String(exam.status || ""))).map((exam) => [
        date(exam.diagnosedAt), str(exam.treatmentName), str(exam.toothNo), ...doctorCol(exam), money(exam.amount),
      ]),
    },
    // Hasta dosyasının Tedavi sekmesindeki "Planlanan tedaviler" listesiyle aynı
    // kayıtlar (ayrı tedavi planı kaldırıldı; önceden plan adımları da buraya
    // "Kaynak" sütunuyla karışıyordu).
    plannedTreatments: {
      title: "Planlanan tedaviler",
      headers: withDoctor(["Tarih", "Tedavi", "Diş", "Tutar"], 3),
      rows: exams.filter((exam) => examStatusKind(String(exam.status || "")) === "pending").map((exam) => [
        date(exam.diagnosedAt), str(exam.treatmentName), str(exam.toothNo), ...doctorCol(exam), money(exam.amount),
      ]),
    },
    payments: {
      title: "Tahsilatlar",
      // Tutar en sağda (belgelerde tutarlar alt alta okunur); POS yöntemin yanında ("Kredi kartı · Garanti").
      headers: withDoctor(["Tarih", "Yöntem", "Açıklama", "Tutar"], 2),
      rows: list(patient.payments).map((payment) => {
        const pos = payment.pos && typeof payment.pos === "object" ? String((payment.pos as Raw).name || "").trim() : "";
        const method = paymentMethodLabel(String(payment.method || ""));
        return [dateTime(payment.createdAt), pos ? `${method} · ${pos}` : method, ...doctorCol(payment), str(payment.description), money(payment.amount)];
      }),
    },
    balance: {
      title: "Hesap özeti",
      headers: ["Alan", "Tutar"],
      rows: [
        ["Yapılan tedaviler", money(balance.totalCharged)],
        ["İndirim oranı", `%${balance.discountRate}`],
        ["İndirimli toplam", money(balance.discountedTotal)],
        ["Alınan tahsilat", money(balance.totalPaid)],
        [balance.totalDebt < 0 ? "Ön ödeme" : "Kalan borç", money(Math.abs(balance.totalDebt))],
      ],
    },
    appointments: {
      title: "Randevular",
      headers: withDoctor(["Tarih", "Tür", "Durum", "Not"], 1),
      rows: list(patient.appointments).map((appointment) => [
        dateTime(appointment.startAt), ...doctorCol(appointment), appointmentTypeLabel(String(appointment.type || "")), statusChipLabel(String(appointment.status || "")), str(appointment.note),
      ]),
    },
    labOrders: {
      title: "Laboratuvar",
      headers: withDoctor(["Tarih", "İş", "Laboratuvar", "Diş", "Durum", "Lab ücreti"], 5),
      rows: list(patient.labOrders).map((order) => {
        const invoices = list(order.invoices).filter((invoice) => invoice.status === undefined || invoice.status === "ACTIVE");
        const summary = getOrderSummary({
          labType: String(order.labType || ""),
          notes: (order.notes as string | null) ?? null,
          status: String(order.status || ""),
          trips: list(order.trips).map((trip) => ({ description: String(trip.description || ""), sentAt: String(trip.sentAt || ""), expectedAt: (trip.expectedAt as string | null) ?? null, receivedAt: (trip.receivedAt as string | null) ?? null, receivedNote: (trip.receivedNote as string | null) ?? null, sentNote: (trip.sentNote as string | null) ?? null })),
          invoices: invoices.map((invoice) => ({ amount: Number(invoice.amount || 0) })),
        });
        return [date(order.createdAt), str(order.labType), str(order.labName), str(order.teeth), LAB_STAGE_LABEL[summary.stage], ...doctorCol(order), money(summary.totalAmount)];
      }),
    },
    prescriptions: {
      title: "Reçeteler",
      headers: withDoctor(["Tarih", "İlaçlar", "Not", "Durum"], 1),
      rows: list(patient.prescriptions).map((rx) => [
        date(rx.createdAt), ...doctorCol(rx), drugText(rx.drugs), str(rx.note), rx.status === "VOID" ? "İptal edildi" : "Geçerli",
      ]),
    },
    documents: {
      title: "Belgeler ve onamlar",
      headers: ["Tarih", "Tür", "Dosya / Başlık", "Ayrıntı"],
      rows: [
        ...list(patient.documents).filter((doc) => !doc.archivedAt).map((doc) => [
          date(doc.createdAt), doc.category === "RONTGEN" ? "Röntgen" : doc.category === "FOTOGRAF" ? "Fotoğraf" : "Belge", str(doc.fileName), [doc.toothNo ? `Diş ${doc.toothNo}` : "", doc.note ? String(doc.note) : ""].filter(Boolean).join(" · ") || "—",
        ]),
        ...list(patient.consents).map((consent) => [
          date(consent.signedAt), "Onam", str(consent.title), consent.status === "IPTAL" ? `İptal: ${str(consent.voidReason)}` : `İmzalayan: ${str(consent.signerName)}`,
        ]),
      ],
    },
    notes: {
      title: "Notlar",
      headers: ["Not"],
      rows: patient.notes ? [[String(patient.notes)]] : [],
    },
  };
}

function escapeCell(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Hasta dosyasını seçilen bölümlerle PDF ya da Excel olarak indirir. Dışa
 * aktarım KVKK erişim kaydı olarak işlem kayıtlarına yazılır (sunucu).
 * PDF kitaplığı (~134 KB) yalnız "PDF indir"e basılınca yüklenir; önceden
 * hasta dosyasının her açılışında iniyordu.
 */
export function ExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, balance, balanceKnown, getLetterhead, hidePatientPhone, can } = usePatientFile();
  const [format, setFormat] = useState<Format>("pdf");
  const [mode, setMode] = useState<Mode>("treatment");
  const [custom, setCustom] = useState<string[]>(TREATMENT_SELECTION);
  const [hideDoctor, setHideDoctor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Yalnız kullanıcının görebildiği bölümler (KVKK: en az yetki).
  // Bakiye bilinmiyorsa (sunucu bakiyesi okunamadı) "Hesap özeti" yanlış sıfırlarla yazılmaz.
  const allowed = useMemo(
    () => SECTIONS.filter((section) => section.anyOf.some((permission) => can(permission)) && (section.key !== "balance" || balanceKnown)),
    [can, balanceKnown],
  );
  const allowedKeys = allowed.map((section) => section.key);
  const selected: SectionKey[] = mode === "all"
    ? allowedKeys
    : mode === "treatment"
      ? TREATMENT_SELECTION.filter((key) => allowedKeys.includes(key))
      : allowedKeys.filter((key) => custom.includes(key));

  const downloadExcel = (sections: Record<SectionKey, Section>, keys: SectionKey[], fileName: string, clinicName: string) => {
    const tables = keys.map((key) => {
      const section = sections[key];
      const body = section.rows.length
        ? section.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeCell(cell)}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${section.headers.length}">Kayıt yok</td></tr>`;
      return `<h2>${escapeCell(section.title)}</h2><table><thead><tr>${section.headers.map((header) => `<th>${escapeCell(header)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
    }).join("<br/>");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8" />
      <style>body{font-family:"Segoe UI",Arial,sans-serif;font-size:10pt}h1{font-size:18pt}h2{font-size:12pt;margin:14px 0 6px}table{border-collapse:collapse;width:100%}th{background:#1e3a5f;color:#fff;text-align:left;padding:6px;border:1px solid #1e3a5f}td{padding:5px 6px;border:1px solid #cbd5e1;mso-number-format:"\\@";vertical-align:top}</style></head>
      <body><h1>${escapeCell(clinicName || "Klinik")} · Hasta raporu</h1><p>${escapeCell(data.fullName)} · ${escapeCell(formatDateText(new Date(), "datetime"))}</p>${tables}</body></html>`;
    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.xls`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  // Antet, devam sayfası başlığı ve "Sayfa X / Y" ortak PDF tasarımından gelir.
  const downloadPdf = async (sections: Record<SectionKey, Section>, keys: SectionKey[], fileName: string) => {
    const { addPdfFacts, addPdfSection, addPdfStats, addPdfTitle, createPdfDoc, preparePdfFonts } = await import("@/lib/pdf-export");
    // Türkçe font ve klinik anteti hazır olunca belge "Doğum tarihi", "Kadın" gibi harflerle yazılır.
    await preparePdfFonts();
    const doc = createPdfDoc();
    let y = addPdfTitle(doc, "Hasta raporu", `Hasta: ${data.fullName}`);
    // Hesap özeti en üstte kart olarak: belgeyi açan önce kalan borcu görür.
    if (keys.includes("balance")) {
      y = addPdfStats(doc, y, [
        { label: "Yapılan tedaviler", value: money(balance.totalCharged) },
        ...(balance.discountRate > 0 ? [{ label: `İndirimli toplam (%${balance.discountRate})`, value: money(balance.discountedTotal) }] : []),
        { label: "Alınan tahsilat", value: money(balance.totalPaid), tone: balance.totalPaid > 0 ? "positive" as const : undefined },
        balance.totalDebt < 0
          ? { label: "Ön ödeme", value: money(-balance.totalDebt), tone: "positive" as const }
          : { label: "Kalan borç", value: money(balance.totalDebt), tone: balance.totalDebt > 0.005 ? "negative" as const : undefined },
      ]);
    }
    keys.forEach((key) => {
      if (key === "balance") return;
      const section = sections[key];
      y = key === "profile"
        ? addPdfFacts(doc, y, section.title, section.rows.map((row): [string, string | number] => [String(row[0]), row[1]]), { columns: 2 })
        : addPdfSection(doc, y, section.title, section.headers, section.rows);
    });
    doc.save(`${fileName}.pdf`);
  };

  const run = async () => {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      const [response, clinic] = await Promise.all([
        fetch(`/api/patients/${data.id}/export`, { cache: "no-store" }),
        getLetterhead(),
      ]);
      if (!response.ok) throw new Error("Hasta verileri okunamadı.");
      const payload = await response.json();
      const patient = (payload?.patient || data) as Raw;
      // Sunucunun döndürmediği (yetkisiz) bölüm belgeye hiç yazılmaz.
      const included = Array.isArray(payload?.includedSections) ? (payload.includedSections as string[]) : null;
      const serverAllows = (key: SectionKey) => {
        if (!included) return true;
        if (key === "completedTreatments") return included.includes("examinations");
        if (key === "plannedTreatments") return included.includes("examinations");
        if (key === "payments") return included.includes("payments");
        if (key === "appointments") return included.includes("appointments");
        if (key === "labOrders") return included.includes("labOrders");
        if (key === "prescriptions") return included.includes("prescriptions");
        if (key === "documents") return included.includes("documents") || included.includes("consents");
        return true;
      };
      const keys = selected.filter(serverAllows);
      const sections = buildSections(patient, balance, hidePatientPhone, hideDoctor);
      const safeName = data.fullName.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "hasta";
      // Dosya adındaki tarih Türkiye günüdür (gece yarısından sonra UTC bir gün geride kalıyordu).
      const fileName = `hasta-raporu-${safeName}-${turkeyDateKey()}`;
      if (format === "pdf") await downloadPdf(sections, keys, fileName);
      else downloadExcel(sections, keys, fileName, clinic.name);
      showToastSafe({ type: "success", message: `${format === "pdf" ? "PDF" : "Excel"} dosyası indirildi.` });
      onClose();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Dışa aktarılamadı.");
    } finally {
      setBusy(false);
    }
  };

  const columns: ListTableColumn<(typeof SECTIONS)[number]>[] = [
    { key: "label", header: "Bölüm", render: (section) => <span className="font-medium text-slate-800">{section.label}</span> },
    { key: "description", header: "İçerik", render: (section) => <span className="text-slate-500">{section.description}</span> },
  ];

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Hasta dosyasını indir"
      description="İndirme, KVKK erişim kaydı olarak işlem kayıtlarına yazılır."
      size="lg"
      trackFormChanges={false}
      onSubmit={run}
      submitting={busy}
      submitDisabled={selected.length === 0}
      submitLabel={format === "pdf" ? "PDF indir" : "Excel indir"}
      error={error}
    >
      <ChoiceCards
        label="Dosya türü"
        variant="pills"
        options={[{ value: "pdf" as Format, label: "PDF (yazdırmak için)" }, { value: "excel" as Format, label: "Excel (düzenlemek için)" }]}
        value={format}
        onChange={setFormat}
      />
      <ChoiceCards
        label="İçerik"
        columns={3}
        options={[
          { value: "treatment" as Mode, label: "Tedavi ve ödeme", description: "Hasta bilgileri, tedaviler, tahsilatlar, hesap" },
          { value: "all" as Mode, label: "Tüm dosya", description: `${allowed.length} bölümün hepsi` },
          { value: "custom" as Mode, label: "Özel seçim", description: "Bölümleri tek tek seçin" },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === "custom" && (
        <ListTable
          columns={columns}
          rows={allowed}
          rowKey={(section) => section.key}
          getRowAriaLabel={(section) => section.label}
          selection={{ selectedIds: custom, onChange: setCustom }}
          mobileCard={(section) => (
            <div>
              <p className="text-sm font-medium text-slate-800">{section.label}</p>
              <p className="text-xs text-slate-500">{section.description}</p>
            </div>
          )}
        />
      )}
      <Switch checked={hideDoctor} onChange={setHideDoctor} label="Hekim adlarını belgeye yazma" description="Hastaya verilecek çıktılarda hekim sütunları çıkarılır." />
    </FormModal>
  );
}
