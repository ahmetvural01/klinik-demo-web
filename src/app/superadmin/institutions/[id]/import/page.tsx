"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { useParams } from "next/navigation";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Disclosure } from "@/components/ui/Disclosure";
import { Section } from "@/components/ui/Section";
import { StatStrip, type StatTone } from "@/components/ui/StatStrip";
import { Select } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { Spinner } from "@/components/ui/Spinner";
import { FormSkeleton } from "@/components/ui/PageSkeleton";
import { LoadErrorState } from "@/components/ui/LoadErrorState";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { count } from "@/components/superadmin/sa-format";
import { errorMessage, saGet, saUpload } from "@/components/superadmin/sa-fetch";

type PreviewSummary = {
  patientsTotal: number;
  patientsNew: number;
  patientsExisting: number;
  patientsInvalid: number;
  paymentsTotal: number;
  paymentsValid: number;
  paymentsInvalid: number;
  paymentsUnmatchedPatient: number;
  paymentsUnmatchedDoctor: number;
  treatmentsTotal: number;
  treatmentsValid: number;
  treatmentsInvalid: number;
  treatmentsUnmatchedPatient: number;
  treatmentsUnresolvedDoctor: number;
  prescriptionsTotal: number;
  prescriptionsValid: number;
  prescriptionsInvalid: number;
  prescriptionsUnmatchedPatient: number;
};

type RowError = { rowNumber: number; errors: string[] };
type RowNote = { rowNumber: number; message: string };

type PreviewResponse = {
  summary: PreviewSummary;
  patientErrors: RowError[];
  paymentErrors: RowError[];
  treatmentErrors: RowError[];
  prescriptionErrors: RowError[];
  patientRowWarnings: RowError[];
  paymentRowWarnings: RowError[];
  treatmentRowWarnings: RowError[];
  prescriptionRowWarnings: RowError[];
  paymentWarnings: RowNote[];
  treatmentWarnings: RowNote[];
  prescriptionWarnings: RowNote[];
};

type BranchOption = { id: string; name: string; isHeadquarters: boolean; isActive: boolean };

type CommitResponse = {
  patientsCreated: number;
  patientsSkippedExisting: number;
  patientsFailed: number;
  paymentsCreated: number;
  paymentsSkipped: number;
  paymentsDuplicate: number;
  treatmentsCreated: number;
  treatmentsSkipped: number;
  treatmentsDuplicate: number;
  prescriptionsCreated: number;
  prescriptionsSkipped: number;
  prescriptionsDuplicate: number;
};

/**
 * Toplu veri aktarımı: şablon → dosya → kontrol → aktar → sonuç. Önceki
 * sürümdeki gizli dosya kutusu klavyeyle açılamıyordu ve sürükle-bırak
 * görünümü vardı ama çalışmıyordu; şimdi düğmeyle de sürükleyerek de dosya
 * seçilir. Sayılar ortak özet şeridinde, uyarılar ortak uyarı kutusunda,
 * satır hataları katlanır listede. Kasa/hakediş uyarısı ve "geri alınamaz"
 * onayı aynen korunur.
 */
export default function InstitutionImportPage() {
  const params = useParams<{ id: string }>();
  const institutionId = params.id;
  const fileInputId = useId();

  const [institutionName, setInstitutionName] = useState<string>("");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [targetBranchId, setTargetBranchId] = useState<string>("");
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataReloadKey, setMetadataReloadKey] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitResponse | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setMetadataLoading(true);
    setMetadataError(null);
    Promise.all([
      saGet<{ name?: string }>(`/api/superadmin/institutions/${institutionId}`, "Klinik bilgisi yüklenemedi.", controller.signal),
      saGet<{ branches?: BranchOption[] }>(`/api/superadmin/institutions/${institutionId}/branches`, "Şube listesi yüklenemedi.", controller.signal),
    ])
      .then(([institutionData, branchData]) => {
        if (!institutionData?.name) throw new Error("Klinik bilgisi beklenmeyen biçimde döndü.");
        const active = (branchData?.branches || []).filter((branch) => branch.isActive);
        if (active.length === 0) throw new Error("Veri aktarımı için aktif bir şube bulunamadı.");
        setInstitutionName(institutionData.name);
        setBranches(active);
        const hq = active.find((branch) => branch.isHeadquarters) || active[0];
        if (hq) setTargetBranchId(hq.id);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMetadataError(errorMessage(error, "Aktarım bilgileri yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setMetadataLoading(false);
      });
    return () => controller.abort();
  }, [institutionId, metadataReloadKey]);

  const downloadTemplate = () => {
    window.location.href = `/api/superadmin/institutions/${institutionId}/import/template`;
  };

  const handleFileChange = async (selected: File | null) => {
    setFile(selected);
    setPreview(null);
    setResult(null);
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".xlsx")) {
      showToastSafe({ type: "error", message: "Yalnız Excel (.xlsx) dosyası yüklenebilir." });
      setFile(null);
      return;
    }

    setPreviewing(true);
    try {
      const body = new FormData();
      body.append("file", selected);
      setPreview(await saUpload<PreviewResponse>(`/api/superadmin/institutions/${institutionId}/import/preview`, body, "Dosya önizlenemedi."));
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Dosya önizlenemedi.") });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setPreviewing(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) void handleFileChange(dropped);
  };

  const commitImport = async () => {
    if (!file || !preview) return;

    const parts = [
      preview.summary.patientsNew > 0 ? `${preview.summary.patientsNew} yeni hasta` : null,
      preview.summary.paymentsValid > 0 ? `${preview.summary.paymentsValid} ödeme` : null,
      preview.summary.treatmentsValid > 0 ? `${preview.summary.treatmentsValid} tedavi` : null,
      preview.summary.prescriptionsValid > 0 ? `${preview.summary.prescriptionsValid} reçete` : null,
    ].filter(Boolean);

    const ledgerNote = preview.summary.paymentsValid > 0
      ? `\n\n${preview.summary.paymentsValid} ödeme Excel'deki tarihleriyle kliniğin kasasına ve o dönemin hekim hakedişlerine eklenecek; kapanmış kasa günleri ve ödenmiş hakedişlerin toplamları değişebilir.`
      : "";
    const confirmed = await confirmDialog({
      title: "Veri aktarımı onaylansın mı?",
      message: `${parts.join(", ")} kaydı ${institutionName || "bu kliniğe"} eklenecek. Bu işlem geri alınamaz.${ledgerNote}`,
      confirmText: "Aktar",
      cancelText: "Vazgeç",
    });
    if (!confirmed) return;

    setCommitting(true);
    try {
      const body = new FormData();
      body.append("file", file);
      if (targetBranchId) body.append("branchId", targetBranchId);
      setResult(await saUpload<CommitResponse>(`/api/superadmin/institutions/${institutionId}/import/commit`, body, "Aktarım başarısız."));
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Aktarım başarısız.") });
    } finally {
      setCommitting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const hasAnythingToImport = preview
    ? preview.summary.patientsNew > 0 || preview.summary.paymentsValid > 0 || preview.summary.treatmentsValid > 0 || preview.summary.prescriptionsValid > 0
    : false;

  const header = (
    <PageHeader
      icon="institutions"
      back={{ href: `/superadmin/institutions/${institutionId}`, label: institutionName || "Klinik dosyası" }}
      title="Toplu veri aktarımı"
      description="Eski hasta, ödeme, tedavi ve reçete kayıtlarını Excel'den alın."
      actions={<Button variant="secondary" icon={Download} onClick={downloadTemplate}>Şablonu indir</Button>}
    />
  );

  if (metadataLoading) {
    return (
      <section className="space-y-4">
        {header}
        <FormSkeleton fields={2} columns={1} />
      </section>
    );
  }

  if (metadataError) {
    return (
      <section className="space-y-4">
        {header}
        <LoadErrorState message={metadataError} onRetry={() => setMetadataReloadKey((value) => value + 1)} />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {header}

      <Section title="1. Dosya" description="Şablonu doldurup yükleyin; hiçbir kayıt önizlemeden önce yazılmaz.">
        <div className="space-y-3">
          <Disclosure title="Şablonda neler var?">
            <p className="text-sm text-slate-600">
              Şablon bu kliniğin doktor listesiyle hazırlanır ve dört sayfadır: hastalar, ödeme geçmişi, tedavi geçmişi,
              reçete geçmişi. Hepsini doldurmak zorunlu değildir; yalnız elde olan veri girilir, kalanı boş bırakılır.
            </p>
          </Disclosure>

          {branches.length > 1 && (
            <FormField label="Kayıtlar hangi şubeye eklensin?" htmlFor="import-branch" hint="Aktarılan tüm kayıtlar seçilen şubeye yazılır.">
              <Select id="import-branch" value={targetBranchId} onChange={(event) => setTargetBranchId(event.target.value)} className="sm:max-w-sm">
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}{b.isHeadquarters ? " (Merkez)" : ""}</option>
                ))}
              </Select>
            </FormField>
          )}

          <div
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-slate-200 bg-slate-50"}`}
          >
            <FileSpreadsheet className="h-7 w-7 text-slate-400" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-700">{file ? file.name : "Excel dosyasını buraya sürükleyin"}</p>
            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              accept=".xlsx"
              className="sr-only"
              onChange={(event) => void handleFileChange(event.target.files?.[0] || null)}
            />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" variant="secondary" icon={Upload} disabled={previewing || committing} onClick={() => fileInputRef.current?.click()}>
                {file ? "Başka dosya seç" : "Dosya seç (.xlsx)"}
              </Button>
              {file && !previewing && <Button size="sm" variant="ghost" disabled={committing} onClick={reset}>Kaldır</Button>}
            </div>
          </div>

          {previewing && (
            <p className="flex items-center justify-center gap-2 py-2 text-sm text-slate-500" role="status">
              <Spinner className="h-4 w-4 text-primary" />
              Dosya inceleniyor…
            </p>
          )}
        </div>
      </Section>

      {preview && !result && (
        <Section
          title="2. Kontrol"
          description="Henüz hiçbir kayıt yazılmadı. Hatalı veya eşleşmeyen satırlar aktarılmaz; Excel'de düzeltip dosyayı yeniden yükleyebilirsiniz."
          footer={(
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!hasAnythingToImport && <span className="text-xs text-slate-500">Aktarılacak geçerli kayıt yok.</span>}
              <Button variant="secondary" onClick={reset} disabled={committing}>Vazgeç</Button>
              <Button loading={committing} disabled={!hasAnythingToImport} onClick={() => void commitImport()}>Aktar</Button>
            </div>
          )}
        >
          <div className="divide-y divide-slate-100">
            <PreviewSection
              title="Hastalar"
              stats={[
                { label: "Yeni hasta", value: preview.summary.patientsNew, tone: "success" },
                { label: "Zaten kayıtlı", value: preview.summary.patientsExisting, tone: "neutral" },
                { label: "Satır hatası", value: preview.summary.patientsInvalid, tone: preview.summary.patientsInvalid > 0 ? "critical" : "neutral" },
              ]}
              errors={preview.patientErrors}
              warnings={preview.patientRowWarnings}
            />

            <PreviewSection
              title="Ödeme geçmişi"
              stats={[
                { label: "Aktarılacak", value: preview.summary.paymentsValid, tone: "success" },
                { label: "Satır hatası", value: preview.summary.paymentsInvalid, tone: preview.summary.paymentsInvalid > 0 ? "critical" : "neutral" },
                { label: "Hastası bulunamadı", value: preview.summary.paymentsUnmatchedPatient, tone: preview.summary.paymentsUnmatchedPatient > 0 ? "warning" : "neutral" },
              ]}
              errors={preview.paymentErrors}
              warnings={preview.paymentRowWarnings}
              unmatched={preview.paymentWarnings}
              ledgerNote={preview.summary.paymentsValid > 0 ? `${preview.summary.paymentsValid} ödeme Excel'deki tarihleriyle kliniğin kasasına ve o dönemin hekim hakedişlerine eklenecek. Kapanmış kasa günlerinin ve ödenmiş hakedişlerin toplamları değişebilir; klinik muhasebesiyle konuşmadan aktarmayın.` : undefined}
              note={preview.summary.paymentsUnmatchedDoctor > 0 ? `${preview.summary.paymentsUnmatchedDoctor} satırda yazılan doktor adı kurum personeliyle eşleşmedi — bu ödemeler doktorsuz eklenecek.` : undefined}
            />

            <PreviewSection
              title="Tedavi geçmişi"
              stats={[
                { label: "Aktarılacak", value: preview.summary.treatmentsValid, tone: "success" },
                { label: "Satır hatası", value: preview.summary.treatmentsInvalid, tone: preview.summary.treatmentsInvalid > 0 ? "critical" : "neutral" },
                { label: "Hastası bulunamadı", value: preview.summary.treatmentsUnmatchedPatient, tone: preview.summary.treatmentsUnmatchedPatient > 0 ? "warning" : "neutral" },
              ]}
              errors={preview.treatmentErrors}
              warnings={preview.treatmentRowWarnings}
              unmatched={preview.treatmentWarnings}
              note={preview.summary.treatmentsUnresolvedDoctor > 0 ? `${preview.summary.treatmentsUnresolvedDoctor} satırda yazılan doktor adı kurum personeliyle eşleşmedi — tedavi kaydı bir doktora zorunlu bağlı olduğu için bu satırlar aktarılamayacak.` : undefined}
            />

            <PreviewSection
              title="Reçete geçmişi"
              stats={[
                { label: "Aktarılacak", value: preview.summary.prescriptionsValid, tone: "success" },
                { label: "Satır hatası", value: preview.summary.prescriptionsInvalid, tone: preview.summary.prescriptionsInvalid > 0 ? "critical" : "neutral" },
                { label: "Hastası bulunamadı", value: preview.summary.prescriptionsUnmatchedPatient, tone: preview.summary.prescriptionsUnmatchedPatient > 0 ? "warning" : "neutral" },
              ]}
              errors={preview.prescriptionErrors}
              warnings={preview.prescriptionRowWarnings}
              unmatched={preview.prescriptionWarnings}
            />
          </div>
        </Section>
      )}

      {result && (
        <Section
          title="Aktarım tamamlandı"
          footer={(
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={reset}>Yeni dosya yükle</Button>
              <Button href={`/superadmin/institutions/${institutionId}`}>Klinik dosyasına dön</Button>
            </div>
          )}
        >
          <div className="space-y-3">
            <Callout tone="success" compact>Kayıtlar {institutionName || "kliniğe"} eklendi.</Callout>
            <StatStrip
              columns={4}
              aria-label="Aktarım sonucu"
              items={[
                { key: "patients", label: "Hasta", value: `${count(result.patientsCreated)} eklendi`, tone: "success", hint: `${count(result.patientsSkippedExisting)} zaten vardı` },
                { key: "payments", label: "Ödeme", value: `${count(result.paymentsCreated)} eklendi`, tone: "success", hint: `${count(result.paymentsSkipped)} atlandı` },
                { key: "treatments", label: "Tedavi", value: `${count(result.treatmentsCreated)} eklendi`, tone: "success", hint: `${count(result.treatmentsSkipped)} atlandı` },
                { key: "prescriptions", label: "Reçete", value: `${count(result.prescriptionsCreated)} eklendi`, tone: "success", hint: `${count(result.prescriptionsSkipped)} atlandı` },
              ]}
            />
            {(result.paymentsDuplicate + result.treatmentsDuplicate + result.prescriptionsDuplicate) > 0 && (
              <p className="text-xs text-slate-500">
                {result.paymentsDuplicate + result.treatmentsDuplicate + result.prescriptionsDuplicate} kayıt bu dosya daha önce yüklendiği için tekrar eklenmedi.
              </p>
            )}
          </div>
        </Section>
      )}
    </section>
  );
}

function PreviewSection({
  title,
  stats,
  errors,
  warnings,
  unmatched = [],
  note,
  ledgerNote,
}: {
  title: string;
  stats: { label: string; value: number; tone: StatTone }[];
  errors: RowError[];
  warnings: RowError[];
  /** Hastası/doktoru eşleşmeyen ve bu yüzden aktarılmayacak satırlar. */
  unmatched?: RowNote[];
  note?: string;
  ledgerNote?: string;
}) {
  return (
    <div className="space-y-2.5 py-4 first:pt-1 last:pb-1">
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      <StatStrip columns={3} aria-label={title} items={stats.map((item) => ({ key: item.label, label: item.label, value: count(item.value), tone: item.tone }))} />
      {note && <Callout tone="warning" compact>{note}</Callout>}
      {ledgerNote && <Callout tone="warning" compact title="Kasa ve hakediş etkilenir">{ledgerNote}</Callout>}
      {errors.length > 0 && <RowList title="Hatalı satırlar (aktarılmayacak)" rows={errors} tone="critical" />}
      {unmatched.length > 0 && (
        <RowList
          title="Eşleşmeyen satırlar (aktarılmayacak — TC veya doktor adını kontrol edin)"
          rows={unmatched.map((row) => ({ rowNumber: row.rowNumber, errors: [row.message] }))}
          tone="warning"
        />
      )}
      {warnings.length > 0 && <RowList title="Uyarılar (kayıt yine de eklenecek)" rows={warnings} tone="warning" />}
    </div>
  );
}

/** Satır listesi katlı başlar: önizleme önce sayıları gösterir, ayrıntı istenince açılır. */
function RowList({ title, rows, tone = "critical" }: { title: string; rows: RowError[]; tone?: "critical" | "warning" }) {
  const labelClass = tone === "critical" ? "text-red-700" : "text-amber-700";
  return (
    <Disclosure title={title} summary={<Badge tone={tone}>{rows.length} satır</Badge>}>
      <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto">
        {rows.map((row) => (
          <div key={`${row.rowNumber}-${row.errors[0] ?? ""}`} className="py-1.5 text-xs">
            <span className={`font-bold ${labelClass}`}>Satır {row.rowNumber}:</span>{" "}
            <span className="text-slate-600">{row.errors.join(", ")}</span>
          </div>
        ))}
      </div>
    </Disclosure>
  );
}
