"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Download, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { Spinner } from "@/components/ui/Spinner";
import { ListRowSkeleton } from "@/components/ui/ListSkeleton";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { LoadErrorState } from "@/components/ui/LoadErrorState";

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

export default function InstitutionImportPage() {
  const params = useParams<{ id: string }>();
  const institutionId = params.id;

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMetadataLoading(true);
    setMetadataError(null);
    Promise.all([
      fetch(`/api/superadmin/institutions/${institutionId}`, { cache: "no-store" }),
      fetch(`/api/superadmin/institutions/${institutionId}/branches`, { cache: "no-store" }),
    ])
      .then(async ([institutionResponse, branchResponse]) => {
        const institutionData = await institutionResponse.json().catch(() => ({}));
        const branchData = await branchResponse.json().catch(() => ({}));
        if (!institutionResponse.ok) throw new Error(institutionData?.message || "Klinik bilgisi yüklenemedi.");
        if (!branchResponse.ok) throw new Error(branchData?.message || "Şube listesi yüklenemedi.");
        if (!institutionData?.name) throw new Error("Klinik bilgisi beklenmeyen biçimde döndü.");
        const active: BranchOption[] = (branchData?.branches || []).filter((branch: BranchOption) => branch.isActive);
        if (active.length === 0) throw new Error("Veri aktarımı için aktif bir şube bulunamadı.");
        setInstitutionName(institutionData.name);
        setBranches(active);
        const hq = active.find((branch) => branch.isHeadquarters) || active[0];
        if (hq) setTargetBranchId(hq.id);
      })
      .catch((error) => setMetadataError(error instanceof Error ? error.message : "Aktarım bilgileri yüklenemedi."))
      .finally(() => setMetadataLoading(false));
  }, [institutionId, metadataReloadKey]);

  const downloadTemplate = () => {
    window.location.href = `/api/superadmin/institutions/${institutionId}/import/template`;
  };

  const handleFileChange = async (selected: File | null) => {
    setFile(selected);
    setPreview(null);
    setResult(null);
    if (!selected) return;

    setPreviewing(true);
    try {
      const body = new FormData();
      body.append("file", selected);
      const res = await fetch(`/api/superadmin/institutions/${institutionId}/import/preview`, { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Dosya önizlenemedi");
      setPreview(data);
    } catch (error) {
      showToastSafe({ title: "Hata", message: error instanceof Error ? error.message : "Dosya önizlenemedi", type: "error" });
      setFile(null);
    } finally {
      setPreviewing(false);
    }
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
      const res = await fetch(`/api/superadmin/institutions/${institutionId}/import/commit`, { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Aktarım başarısız");
      setResult(data);
      showToastSafe({ title: "Tamamlandı", message: "Veri aktarımı tamamlandı", type: "success", icon: "institutions" });
    } catch (error) {
      showToastSafe({ title: "Hata", message: error instanceof Error ? error.message : "Aktarım başarısız", type: "error" });
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
      description={`${institutionName ? `${institutionName} için` : "Klinik için"} eski hasta, ödeme, tedavi ve reçete kayıtlarını Excel'den içe alın.`}
    />
  );

  if (metadataLoading) {
    return (
      <section className="mx-auto max-w-4xl space-y-4">
        {header}
        <div className="ui-surface overflow-hidden"><ListRowSkeleton rows={3} /></div>
      </section>
    );
  }

  if (metadataError) {
    return (
      <section className="mx-auto max-w-4xl space-y-4">
        {header}
        <LoadErrorState message={metadataError} onRetry={() => setMetadataReloadKey((value) => value + 1)} />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl space-y-4">
      {header}

      {/* Adım 1: Şablon */}
      <div className="ui-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="text-sm font-bold text-slate-900">1. Şablonu indirin</h2>
            <p className="mt-1 text-xs text-slate-500">
              Bu kliniğin mevcut doktor listesiyle önceden hazırlanmış Excel şablonunu indirin ve kliniğe iletin.
              Şablonda 4 sayfa vardır: Hastalar, Odeme Gecmisi, Tedavi Gecmisi, Recete Gecmisi — hepsini doldurmak
              zorunlu değildir, sadece elde olan veri girilir, kalanı boş bırakılır.
            </p>
          </div>
          <Button variant="secondary" icon={Download} onClick={downloadTemplate}>
            Şablonu indir
          </Button>
        </div>
      </div>

      {/* Hedef şube (birden fazla şubesi olan kurumlar için) */}
      {branches.length > 1 && (
        <div className="ui-surface p-4">
          <FormField label="Kayıtlar hangi şubeye eklensin?" htmlFor="import-branch" hint="Bu kliniğin birden fazla şubesi var; aktarılan tüm kayıtlar seçilen şubeye yazılır.">
            <Select id="import-branch" value={targetBranchId} onChange={(event) => setTargetBranchId(event.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}{b.isHeadquarters ? " (Merkez)" : ""}</option>
              ))}
            </Select>
          </FormField>
        </div>
      )}

      {/* Adım 2: Yükle */}
      <div className="ui-surface p-4">
        <h2 className="text-sm font-bold text-slate-900">2. Doldurulmuş dosyayı yükleyin</h2>
        <p className="mt-1 text-xs text-slate-500">Yükleme sonrası hiçbir kayıt yazılmadan önce bir önizleme gösterilir.</p>

        <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center transition hover:border-primary hover:bg-primary/5">
          <FileSpreadsheet className="h-8 w-8 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700">{file ? file.name : "Dosya seçmek için tıklayın (.xlsx)"}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => void handleFileChange(e.target.files?.[0] || null)}
          />
        </label>

        {previewing && (
          <div className="mt-4 flex items-center justify-center gap-2 py-4 text-sm text-slate-500">
            <Spinner className="h-5 w-5 text-primary" />
            Dosya inceleniyor...
          </div>
        )}
      </div>

      {/* Adım 3: Önizleme */}
      {preview && !result && (
        <div className="ui-surface p-4">
          <h2 className="text-sm font-bold text-slate-900">3. Kontrol edin ve aktarın</h2>
          <p className="mt-1 text-xs text-slate-500">Henüz hiçbir kayıt yazılmadı. Hatalı veya eşleşmeyen satırlar aktarılmaz; Excel&apos;de düzeltip dosyayı yeniden yükleyebilirsiniz.</p>

          <PreviewSection
            title="Hastalar"
            stats={[
              { label: "Yeni Hasta", value: preview.summary.patientsNew, tone: "success" },
              { label: "Zaten Kayıtlı", value: preview.summary.patientsExisting, tone: "neutral" },
              { label: "Satır Hatası", value: preview.summary.patientsInvalid, tone: preview.summary.patientsInvalid > 0 ? "critical" : "neutral" },
            ]}
            errors={preview.patientErrors}
            warnings={preview.patientRowWarnings}
          />

          <PreviewSection
            title="Ödeme Geçmişi"
            stats={[
              { label: "Aktarılacak", value: preview.summary.paymentsValid, tone: "success" },
              { label: "Satır Hatası", value: preview.summary.paymentsInvalid, tone: preview.summary.paymentsInvalid > 0 ? "critical" : "neutral" },
              { label: "Hastası Bulunamadı", value: preview.summary.paymentsUnmatchedPatient, tone: preview.summary.paymentsUnmatchedPatient > 0 ? "warning" : "neutral" },
            ]}
            errors={preview.paymentErrors}
            warnings={preview.paymentRowWarnings}
            unmatched={preview.paymentWarnings}
            ledgerNote={preview.summary.paymentsValid > 0 ? `${preview.summary.paymentsValid} ödeme Excel'deki tarihleriyle kliniğin kasasına ve o dönemin hekim hakedişlerine eklenecek. Kapanmış kasa günlerinin ve ödenmiş hakedişlerin toplamları değişebilir; klinik muhasebesiyle konuşmadan aktarmayın.` : undefined}
            note={preview.summary.paymentsUnmatchedDoctor > 0 ? `${preview.summary.paymentsUnmatchedDoctor} satırda yazılan doktor adı kurum personeliyle eşleşmedi — bu ödemeler doktorsuz eklenecek.` : undefined}
          />

          <PreviewSection
            title="Tedavi Geçmişi"
            stats={[
              { label: "Aktarılacak", value: preview.summary.treatmentsValid, tone: "success" },
              { label: "Satır Hatası", value: preview.summary.treatmentsInvalid, tone: preview.summary.treatmentsInvalid > 0 ? "critical" : "neutral" },
              { label: "Hastası Bulunamadı", value: preview.summary.treatmentsUnmatchedPatient, tone: preview.summary.treatmentsUnmatchedPatient > 0 ? "warning" : "neutral" },
            ]}
            errors={preview.treatmentErrors}
            warnings={preview.treatmentRowWarnings}
            unmatched={preview.treatmentWarnings}
            note={preview.summary.treatmentsUnresolvedDoctor > 0 ? `${preview.summary.treatmentsUnresolvedDoctor} satırda yazılan doktor adı kurum personeliyle eşleşmedi — tedavi kaydı bir doktora zorunlu bağlı olduğu için bu satırlar aktarılamayacak.` : undefined}
          />

          <PreviewSection
            title="Reçete Geçmişi"
            stats={[
              { label: "Aktarılacak", value: preview.summary.prescriptionsValid, tone: "success" },
              { label: "Satır Hatası", value: preview.summary.prescriptionsInvalid, tone: preview.summary.prescriptionsInvalid > 0 ? "critical" : "neutral" },
              { label: "Hastası Bulunamadı", value: preview.summary.prescriptionsUnmatchedPatient, tone: preview.summary.prescriptionsUnmatchedPatient > 0 ? "warning" : "neutral" },
            ]}
            errors={preview.prescriptionErrors}
            warnings={preview.prescriptionRowWarnings}
            unmatched={preview.prescriptionWarnings}
          />

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={reset}>Vazgeç</Button>
            <Button
              loading={committing}
              disabled={!hasAnythingToImport}
              onClick={() => void commitImport()}
            >
              Onayla ve Aktar
            </Button>
          </div>
        </div>
      )}

      {/* Sonuç */}
      {result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-sm font-bold text-emerald-800">Aktarım tamamlandı</h2>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBox label="Eklenen Hasta" value={result.patientsCreated} tone="success" />
            <StatBox label="Zaten Vardı" value={result.patientsSkippedExisting} tone="neutral" />
            <StatBox label="Eklenen Ödeme" value={result.paymentsCreated} tone="success" />
            <StatBox label="Eklenen Tedavi" value={result.treatmentsCreated} tone="success" />
            <StatBox label="Eklenen Reçete" value={result.prescriptionsCreated} tone="success" />
            <StatBox label="Atlanan Ödeme" value={result.paymentsSkipped} tone={result.paymentsSkipped > 0 ? "warning" : "neutral"} />
            <StatBox label="Atlanan Tedavi" value={result.treatmentsSkipped} tone={result.treatmentsSkipped > 0 ? "warning" : "neutral"} />
            <StatBox label="Atlanan Reçete" value={result.prescriptionsSkipped} tone={result.prescriptionsSkipped > 0 ? "warning" : "neutral"} />
          </div>
          {(result.paymentsDuplicate + result.treatmentsDuplicate + result.prescriptionsDuplicate) > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              {result.paymentsDuplicate + result.treatmentsDuplicate + result.prescriptionsDuplicate} kayıt bu dosyanın daha önce yüklendiği için tekrar eklenmedi.
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={reset}>Yeni dosya yükle</Button>
            <Button href={`/superadmin/institutions/${institutionId}`}>Klinik dosyasına dön</Button>
          </div>
        </div>
      )}
    </section>
  );
}

type Tone = "success" | "warning" | "critical" | "neutral";

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
  stats: { label: string; value: number; tone: Tone }[];
  errors: RowError[];
  warnings: RowError[];
  /** Hastası/doktoru eşleşmeyen ve bu yüzden aktarılmayacak satırlar. */
  unmatched?: RowNote[];
  note?: string;
  ledgerNote?: string;
}) {
  return (
    <div className="mt-4 border-t border-slate-100 pt-4 first:mt-3 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:gap-3">
        {stats.map((s) => <StatBox key={s.label} label={s.label} value={s.value} tone={s.tone} />)}
      </div>
      {note && (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {note}
        </p>
      )}
      {ledgerNote && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {ledgerNote}
        </p>
      )}
      {errors.length > 0 && <ErrorList title="Hatalı satırlar (aktarılmayacak)" rows={errors} tone="critical" />}
      {unmatched.length > 0 && (
        <ErrorList
          title="Eşleşmeyen satırlar (aktarılmayacak — TC veya doktor adını kontrol edin)"
          rows={unmatched.map((row) => ({ rowNumber: row.rowNumber, errors: [row.message] }))}
          tone="warning"
        />
      )}
      {warnings.length > 0 && <ErrorList title="Uyarılar (kayıt yine de eklenecek)" rows={warnings} tone="warning" />}
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const toneClass = {
    success: "text-emerald-600",
    warning: "text-amber-600",
    critical: "text-red-600",
    neutral: "text-slate-900",
  }[tone];
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function ErrorList({ title, rows, tone = "critical" }: { title: string; rows: RowError[]; tone?: "critical" | "warning" }) {
  const borderClass = tone === "critical" ? "border-red-100" : "border-amber-100";
  const rowBorderClass = tone === "critical" ? "border-red-50" : "border-amber-50";
  const labelClass = tone === "critical" ? "text-red-700" : "text-amber-700";
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center gap-2">
        <Badge tone={tone}>{rows.length} satır</Badge>
        <h4 className="text-xs font-semibold text-slate-600">{title}</h4>
      </div>
      <div className={`max-h-56 overflow-y-auto rounded-lg border ${borderClass}`}>
        {rows.map((row) => (
          <div key={`${row.rowNumber}-${row.errors[0] ?? ""}`} className={`border-b ${rowBorderClass} px-3 py-2 text-xs last:border-b-0`}>
            <span className={`font-bold ${labelClass}`}>Satır {row.rowNumber}:</span>{" "}
            <span className="text-slate-600">{row.errors.join(", ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
