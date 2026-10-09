"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Switch } from "@/components/ui/Switch";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { formatDateText } from "@/components/ui/Money";
import { addPdfSection, createPdfDoc, pdfSafeText } from "@/lib/pdf-export";
import { showToastSafe } from "@/lib/toast-client";
import { examStatusKind, isChargeableExamStatus } from "@/lib/examination-status";
import { LAB_STAGE_LABEL, getOrderSummary } from "@/lib/lab-workflow";
import { usePatientFile } from "./PatientFileContext";
import { appointmentStatusView, appointmentTypeLabel, genderLabel, healthFlagsOf, money, paymentMethodLabel, type PatientBalance } from "./patient-file-shared";

type SectionKey = "profile" | "completedTreatments" | "plannedTreatments" | "payments" | "balance" | "appointments" | "labOrders" | "prescriptions" | "documents" | "notes";
type Format = "pdf" | "excel";
type Section = { title: string; headers: string[]; rows: (string | number)[][] };
type Raw = Record<string, unknown>;

const SECTIONS: { key: SectionKey; label: string; description: string }[] = [
  { key: "profile", label: "Hasta bilgileri", description: "Kimlik, iletişim, sağlık uyarıları" },
  { key: "completedTreatments", label: "Yapılan tedaviler", description: "Borca yansıyan tedaviler" },
  { key: "plannedTreatments", label: "Yapılacak tedaviler", description: "Muayene listesi ve tedavi planı adımları" },
  { key: "payments", label: "Tahsilatlar", description: "Tarih, tutar, yöntem, POS" },
  { key: "balance", label: "Hesap özeti", description: "Tedavi toplamı, indirim, tahsilat, kalan" },
  { key: "appointments", label: "Randevular", description: "Geçmiş ve gelecek randevular" },
  { key: "labOrders", label: "Laboratuvar", description: "Lab işleri, durumları, faturaları" },
  { key: "prescriptions", label: "Reçeteler", description: "Yazılan ilaçlar ve notlar" },
  { key: "documents", label: "Belgeler ve onamlar", description: "Dosya listesi ve imzalı onamlar" },
  { key: "notes", label: "Notlar", description: "Hasta notları" },
];

const DEFAULT_SELECTION: SectionKey[] = ["profile", "completedTreatments", "plannedTreatments", "payments", "balance"];
const PRESETS: { label: string; keys: SectionKey[] }[] = [
  { label: "Tedavi ve ödeme", keys: DEFAULT_SELECTION },
  { label: "Yalnız randevular", keys: ["appointments"] },
  { label: "Tüm dosya", keys: SECTIONS.map((section) => section.key) },
];

const list = (value: unknown): Raw[] => (Array.isArray(value) ? (value as Raw[]) : []);
const str = (value: unknown) => (value === null || value === undefined || value === "" ? "-" : String(value));
const date = (value: unknown) => (value ? formatDateText(String(value)) : "-");
const dateTime = (value: unknown) => (value ? formatDateText(String(value), "datetime") : "-");
const name = (value: unknown) => (value && typeof value === "object" && "fullName" in value ? str((value as Raw).fullName) : "-");

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
  const plannedFromPlans = list(patient.treatmentPlans).flatMap((plan) => list(plan.steps)
    .filter((step) => !["TAMAMLANDI", "IPTAL"].includes(String(step.status || "")))
    .map((step): Raw => ({ ...step, planTitle: plan.title, doctor: plan.doctor, date: step.doneAt || plan.createdAt })));
  const health = healthFlagsOf(patient as unknown as Parameters<typeof healthFlagsOf>[0]).join(", ") || "Bilinen uyarı yok";

  return {
    profile: {
      title: "Hasta Bilgileri",
      headers: ["Alan", "Değer"],
      rows: [
        ["Ad Soyad", str(patient.fullName)],
        ["TC Kimlik", hidePhone ? "***" : str(patient.tcNo)],
        ["Telefon", hidePhone ? "***" : str(patient.phone)],
        ["Cinsiyet", genderLabel(String(patient.gender || "")) || "-"],
        ["Doğum Tarihi", date(patient.birthDate)],
        ["Kurum / Sigorta", str(patient.insurance)],
        ["İndirim", `%${Number(patient.discountRate || 0)}`],
        ["Meslek", str(patient.profession)],
        ["Sağlık Uyarıları", health],
        ["Kullandığı İlaçlar", str(patient.medications)],
        ["Geçirdiği Ameliyatlar", str(patient.surgeries)],
        ["Diğer Hastalıklar", str(patient.otherDiseases)],
      ],
    },
    completedTreatments: {
      title: "Yapılan Tedaviler",
      headers: withDoctor(["Tarih", "Tedavi", "Diş", "Tutar"], 4),
      rows: exams.filter((exam) => isChargeableExamStatus(String(exam.status || ""))).map((exam) => [
        date(exam.diagnosedAt), str(exam.treatmentName), str(exam.toothNo), money(exam.amount), ...doctorCol(exam),
      ]),
    },
    plannedTreatments: {
      title: "Yapılacak Tedaviler",
      headers: withDoctor(["Kaynak", "Tarih", "Tedavi", "Diş", "Tutar"], 5),
      rows: [
        ...exams.filter((exam) => examStatusKind(String(exam.status || "")) === "pending").map((exam) => [
          "Muayene listesi", date(exam.diagnosedAt), str(exam.treatmentName), str(exam.toothNo), money(exam.amount), ...doctorCol(exam),
        ]),
        ...plannedFromPlans.map((step) => [
          str(step.planTitle) === "-" ? "Tedavi planı" : str(step.planTitle), date(step.date), str(step.treatmentName), str(step.toothNo), money(step.amount), ...doctorCol(step as Raw),
        ]),
      ],
    },
    payments: {
      title: "Tahsilatlar",
      headers: withDoctor(["Tarih", "Tutar", "Yöntem", "POS", "Açıklama"], 4),
      rows: list(patient.payments).map((payment) => [
        dateTime(payment.createdAt), money(payment.amount), paymentMethodLabel(String(payment.method || "")), payment.pos && typeof payment.pos === "object" ? str((payment.pos as Raw).name) : "-", ...doctorCol(payment), str(payment.description),
      ]),
    },
    balance: {
      title: "Hesap Özeti",
      headers: ["Alan", "Tutar"],
      rows: [
        ["Yapılan tedaviler", money(balance.totalCharged)],
        ["İndirim oranı", `%${balance.discountRate}`],
        ["İndirimli toplam", money(balance.discountedTotal)],
        ["Alınan tahsilat", money(balance.totalPaid)],
        [balance.totalDebt < 0 ? "Hastanın avansı" : "Kalan borç", money(Math.abs(balance.totalDebt))],
      ],
    },
    appointments: {
      title: "Randevular",
      headers: withDoctor(["Tarih", "Tür", "Durum", "Not"], 1),
      rows: list(patient.appointments).map((appointment) => [
        dateTime(appointment.startAt), ...doctorCol(appointment), appointmentTypeLabel(String(appointment.type || "")), appointmentStatusView(String(appointment.status || "")).label, str(appointment.note),
      ]),
    },
    labOrders: {
      title: "Laboratuvar",
      headers: withDoctor(["Tarih", "İş", "Laboratuvar", "Diş", "Durum", "Lab ücreti"], 6),
      rows: list(patient.labOrders).map((order) => {
        const invoices = list(order.invoices).filter((invoice) => invoice.status === undefined || invoice.status === "ACTIVE");
        const summary = getOrderSummary({
          labType: String(order.labType || ""),
          notes: (order.notes as string | null) ?? null,
          status: String(order.status || ""),
          trips: list(order.trips).map((trip) => ({ description: String(trip.description || ""), sentAt: String(trip.sentAt || ""), expectedAt: (trip.expectedAt as string | null) ?? null, receivedAt: (trip.receivedAt as string | null) ?? null, receivedNote: (trip.receivedNote as string | null) ?? null, sentNote: (trip.sentNote as string | null) ?? null })),
          invoices: invoices.map((invoice) => ({ amount: Number(invoice.amount || 0) })),
        });
        return [date(order.createdAt), str(order.labType), str(order.labName), str(order.teeth), LAB_STAGE_LABEL[summary.stage], money(summary.totalAmount), ...doctorCol(order)];
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
      title: "Belgeler ve Onamlar",
      headers: ["Tarih", "Tür", "Dosya / Başlık", "Ayrıntı"],
      rows: [
        ...list(patient.documents).filter((doc) => !doc.archivedAt).map((doc) => [
          date(doc.createdAt), doc.category === "RONTGEN" ? "Röntgen" : doc.category === "FOTOGRAF" ? "Fotoğraf" : "Belge", str(doc.fileName), [doc.toothNo ? `Diş ${doc.toothNo}` : "", doc.note ? String(doc.note) : ""].filter(Boolean).join(" · ") || "-",
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
 * Hasta dosyasını seçilen bölümlerle PDF veya Excel olarak indirir. Dışa
 * aktarım KVKK erişim kaydı olarak işlem kayıtlarına yazılır (sunucu).
 */
export function ExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, balance, clinicName, hidePatientPhone } = usePatientFile();
  const [format, setFormat] = useState<Format>("pdf");
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTION);
  const [hideDoctor, setHideDoctor] = useState(false);
  const [busy, setBusy] = useState(false);

  const keys = SECTIONS.map((section) => section.key).filter((key) => selected.includes(key));

  const downloadExcel = (sections: Record<SectionKey, Section>, fileName: string) => {
    const tables = keys.map((key) => {
      const section = sections[key];
      const body = section.rows.length
        ? section.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeCell(cell)}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${section.headers.length}">Kayıt yok</td></tr>`;
      return `<h2>${escapeCell(section.title)}</h2><table><thead><tr>${section.headers.map((header) => `<th>${escapeCell(header)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
    }).join("<br/>");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8" />
      <style>body{font-family:"Segoe UI",Arial,sans-serif;font-size:10pt}h1{font-size:18pt}h2{font-size:12pt;margin:14px 0 6px}table{border-collapse:collapse;width:100%}th{background:#0f172a;color:#fff;text-align:left;padding:6px;border:1px solid #334155}td{padding:5px 6px;border:1px solid #cbd5e1;mso-number-format:"\\@";vertical-align:top}</style></head>
      <body><h1>${escapeCell(clinicName || "Klinik")} · Hasta raporu</h1><p>${escapeCell(data.fullName)} · ${escapeCell(formatDateText(new Date(), "datetime"))}</p>${tables}</body></html>`;
    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.xls`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  const downloadPdf = (sections: Record<SectionKey, Section>, fileName: string) => {
    const doc = createPdfDoc("l");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const header = (suffix = "") => {
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 20, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.text(pdfSafeText(`Hasta raporu${suffix}`), 14, 11);
      doc.setFontSize(8.5);
      doc.text(pdfSafeText(`${clinicName || "Klinik"} · ${data.fullName} · ${formatDateText(new Date(), "datetime")}`), 14, 17);
      doc.setTextColor(17, 24, 39);
    };
    header();
    let y = 28;
    keys.forEach((key) => {
      if (y > 175) {
        doc.addPage();
        header(" (devam)");
        y = 28;
      }
      y = addPdfSection(doc, y, sections[key].title, sections[key].headers, sections[key].rows);
    });
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(pdfSafeText(`${clinicName || "Klinik"} · ${data.fullName}`), 14, pageHeight - 6);
      doc.text(pdfSafeText(`Sayfa ${page}/${pages}`), pageWidth - 14, pageHeight - 6, { align: "right" });
    }
    doc.save(`${fileName}.pdf`);
  };

  const run = async () => {
    if (keys.length === 0 || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/patients/${data.id}/export`, { cache: "no-store" });
      if (!response.ok) throw new Error("Hasta verileri okunamadı.");
      const payload = await response.json();
      const patient = (payload?.patient || data) as Raw;
      const sections = buildSections(patient, balance, hidePatientPhone, hideDoctor);
      const safeName = data.fullName.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "hasta";
      const fileName = `hasta-raporu-${safeName}-${new Date().toISOString().slice(0, 10)}`;
      if (format === "pdf") downloadPdf(sections, fileName);
      else downloadExcel(sections, fileName);
      showToastSafe({ type: "success", message: `${format === "pdf" ? "PDF" : "Excel"} dosyası indirildi.` });
      onClose();
    } catch (error) {
      showToastSafe({ type: "error", message: error instanceof Error ? error.message : "Dışa aktarılamadı." });
    } finally {
      setBusy(false);
    }
  };

  const columns: ListTableColumn<(typeof SECTIONS)[number]>[] = [
    { key: "label", header: "Bölüm", render: (section) => <span className="font-medium text-slate-800">{section.label}</span> },
    { key: "description", header: "İçerik", render: (section) => <span className="text-slate-500">{section.description}</span> },
  ];

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title="Hasta dosyasını indir"
      description="İhtiyacınız olan bölümleri seçin. İndirme, KVKK erişim kaydı olarak işlem kayıtlarına yazılır."
      size="lg"
      trackFormChanges={false}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Vazgeç</Button>
          <Button icon={Download} onClick={() => void run()} loading={busy} disabled={keys.length === 0}>{format === "pdf" ? "PDF indir" : "Excel indir"}</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <ChoiceCards
          label="Dosya türü"
          variant="pills"
          options={[{ value: "pdf" as Format, label: "PDF (yazdırmak için)" }, { value: "excel" as Format, label: "Excel (düzenlemek için)" }]}
          value={format}
          onChange={setFormat}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-800">Hızlı seçim:</span>
          {PRESETS.map((preset) => (
            <Button key={preset.label} size="sm" variant="ghost" onClick={() => setSelected(preset.keys)}>{preset.label}</Button>
          ))}
        </div>
        <ListTable
          columns={columns}
          rows={SECTIONS}
          rowKey={(section) => section.key}
          getRowAriaLabel={(section) => section.label}
          selection={{ selectedIds: selected, onChange: setSelected }}
          mobileCard={(section) => (
            <div>
              <p className="text-sm font-medium text-slate-800">{section.label}</p>
              <p className="text-xs text-slate-500">{section.description}</p>
            </div>
          )}
        />
        <Switch checked={hideDoctor} onChange={setHideDoctor} label="Hekim adlarını belgeye yazma" description="Hastaya verilecek çıktılarda hekim sütunları çıkarılır." />
      </div>
    </Modal>
  );
}
