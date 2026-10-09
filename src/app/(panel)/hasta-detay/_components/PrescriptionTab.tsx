"use client";

import { useMemo, useState } from "react";
import { Eye, Pill, Plus, Trash2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { formatDateText } from "@/components/ui/Money";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { MEDICATION_TEMPLATES } from "@/lib/medications";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { usePatientFile } from "./PatientFileContext";
import { errorMessageOf, type Rx } from "./patient-file-shared";

type Drug = { name: string; dose: string; usage: string; duration: string; note: string };

function parseDrugs(raw: string): Drug[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({
          name: String(item.name || ""),
          dose: String(item.dose || ""),
          usage: String(item.usage || ""),
          duration: String(item.duration || ""),
          note: String(item.note || ""),
        }))
        .filter((drug) => drug.name);
    }
  } catch {
    // Eski kayıtlar düz metin olabilir.
  }
  return raw ? [{ name: raw, dose: "", usage: "", duration: "", note: "" }] : [];
}

const isVoid = (rx: Rx) => rx.status === "VOID";

export function PrescriptionTab() {
  const { data, patientId, reload, can, doctors, recentDoctorId, treatingDoctorNames } = usePatientFile();
  const canWrite = can("prescriptions:write");
  const [medicationId, setMedicationId] = useState("");
  const [drugNote, setDrugNote] = useState("");
  const [drugs, setDrugs] = useState<Drug[]>([]);
  // Hekim boşsa hastayı en son tedavi eden hekim önerilir; kullanıcı değiştirebilir.
  const [doctorChoice, setDoctorChoice] = useState<string | null>(null);
  const doctorId = doctorChoice ?? recentDoctorId;
  const [rxNote, setRxNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");

  const doctorName = doctors.find((doctor) => doctor.id === doctorId)?.fullName || "";
  const doctorMismatch = Boolean(doctorId && treatingDoctorNames.length > 0 && doctorName && !treatingDoctorNames.includes(doctorName));

  const addDrug = () => {
    const template = MEDICATION_TEMPLATES.find((item) => item.id === medicationId);
    if (!template) {
      setErrors((current) => ({ ...current, medication: "Listeden bir ilaç seçin." }));
      return;
    }
    setDrugs((current) => [...current, { name: template.name, dose: template.dose, usage: template.usage, duration: template.duration, note: drugNote.trim() }]);
    setMedicationId("");
    setDrugNote("");
    setErrors((current) => ({ ...current, medication: "", drugs: "" }));
  };

  const save = async () => {
    if (saving) return;
    const next: Record<string, string> = {};
    if (drugs.length === 0) next.drugs = "En az bir ilaç ekleyin.";
    if (!doctorId) next.doctor = "Reçeteyi yazan hekimi seçin.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, drugs: JSON.stringify(drugs), note: rxNote.trim(), doctorId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessageOf(body, "Reçete kaydedilemedi."));
      showToastSafe({ type: "success", icon: "clipboard", message: "Reçete kaydedildi." });
      setDrugs([]);
      setRxNote("");
      void reload(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Reçete kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const voidPrescription = async (rx: Rx) => {
    if (busyId) return;
    if (!(await confirmDialog({ message: "Reçete iptal edilsin mi? Kayıt geçmişte “İptal edildi” olarak kalır.", danger: true, confirmText: "Reçeteyi iptal et" }))) return;
    setBusyId(rx.id);
    try {
      const response = await fetch(`/api/prescriptions/${rx.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessageOf(body, "Reçete iptal edilemedi."));
      showToastSafe({ type: "success", message: "Reçete iptal edildi." });
      void reload(true);
    } catch (voidError) {
      showToastSafe({ type: "error", message: voidError instanceof Error ? voidError.message : "Reçete iptal edilemedi." });
    } finally {
      setBusyId("");
    }
  };

  const history = useMemo(() => data.prescriptions.map((rx) => ({ rx, drugs: parseDrugs(rx.drugs) })), [data.prescriptions]);
  type HistoryRow = (typeof history)[number];

  const drugNames = (row: HistoryRow) => row.drugs.map((drug) => [drug.name, drug.dose].filter(Boolean).join(" ")).join(", ");
  const rowActions = (row: HistoryRow) => (
    <div className="flex justify-end gap-1.5">
      <IconButton icon={Eye} title="Reçeteyi aç / yazdır" size="sm" href={`/recete?id=${row.rx.id}&patientId=${patientId}`} />
      {canWrite && !isVoid(row.rx) && <IconButton icon={XCircle} title="Reçeteyi iptal et" tone="danger" size="sm" disabled={busyId === row.rx.id} onClick={() => void voidPrescription(row.rx)} />}
    </div>
  );

  const historyColumns: ListTableColumn<HistoryRow>[] = [
    { key: "date", header: "Tarih", render: (row) => <span className="whitespace-nowrap">{formatDateText(row.rx.createdAt)}</span> },
    { key: "drugs", header: "İlaçlar", render: (row) => <span className={isVoid(row.rx) ? "text-slate-400 line-through" : "text-slate-800"}>{drugNames(row) || <EmptyValue />}</span> },
    { key: "doctor", header: "Hekim", render: (row) => row.rx.doctor?.fullName || <EmptyValue /> },
    { key: "status", header: "Durum", render: (row) => (isVoid(row.rx) ? <Badge tone="neutral">İptal edildi</Badge> : <Badge tone="success">Geçerli</Badge>) },
    { key: "actions", header: "", align: "right", render: rowActions },
  ];

  const draftColumns: ListTableColumn<Drug & { index: number }>[] = [
    { key: "name", header: "İlaç", render: (drug) => <span className="font-semibold text-slate-800">{drug.name} <span className="font-normal text-slate-500">{drug.dose}</span></span> },
    { key: "usage", header: "Kullanım", render: (drug) => [drug.usage, drug.duration].filter(Boolean).join(" · ") },
    { key: "note", header: "Not", render: (drug) => drug.note || <EmptyValue /> },
    { key: "actions", header: "", align: "right", render: (drug) => <IconButton icon={Trash2} title="Listeden çıkar" tone="danger" size="sm" onClick={() => setDrugs((current) => current.filter((_, index) => index !== drug.index))} /> },
  ];

  return (
    <div className="space-y-4">
      {canWrite && (
        <section className="ui-surface space-y-4 p-4 sm:p-5" aria-label="Yeni reçete">
          <div>
            <h2 className="text-base font-bold text-slate-900">Yeni reçete</h2>
            <p className="mt-0.5 text-sm text-slate-500">İlacı seçip listeye ekleyin; doz ve kullanım bilgisi kendiliğinden gelir.</p>
          </div>
          <FormErrorBanner message={error} />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <FormField label="İlaç" htmlFor="hd-rx-drug" error={errors.medication || undefined}>
              <Select id="hd-rx-drug" value={medicationId} onChange={(event) => { setMedicationId(event.target.value); setErrors((current) => ({ ...current, medication: "" })); }}>
                <option value="">İlaç seçin</option>
                {MEDICATION_TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.dose}</option>)}
              </Select>
            </FormField>
            <FormField label="İlaca özel not" htmlFor="hd-rx-drug-note" hint="İsteğe bağlı.">
              <Input id="hd-rx-drug-note" value={drugNote} maxLength={200} onChange={(event) => setDrugNote(event.target.value)} placeholder="Örn. yemekten sonra" />
            </FormField>
            <Button variant="secondary" icon={Plus} onClick={addDrug} className="sm:mb-[22px]">Listeye ekle</Button>
          </div>

          {drugs.length > 0 ? (
            <ListTable
              columns={draftColumns}
              rows={drugs.map((drug, index) => ({ ...drug, index }))}
              rowKey={(drug) => `${drug.index}-${drug.name}`}
              mobileCard={(drug) => (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{drug.name} <span className="font-normal text-slate-500">{drug.dose}</span></p>
                    <p className="text-xs text-slate-500">{[drug.usage, drug.duration, drug.note].filter(Boolean).join(" · ")}</p>
                  </div>
                  <IconButton icon={Trash2} title="Listeden çıkar" tone="danger" size="sm" onClick={() => setDrugs((current) => current.filter((_, index) => index !== drug.index))} />
                </div>
              )}
            />
          ) : (
            <p className={`rounded-lg px-3 py-2.5 text-sm ${errors.drugs ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-500"}`}>
              {errors.drugs || "Henüz ilaç eklenmedi."}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label="Reçeteyi yazan hekim"
              htmlFor="hd-rx-doctor"
              required
              error={errors.doctor || undefined}
              hint={doctorMismatch ? "Bu hekim hastayı tedavi edenler arasında değil — kontrol edin." : undefined}
            >
              <DoctorSelect id="hd-rx-doctor" value={doctorId} doctors={doctors} onChange={(id) => setDoctorChoice(id)} />
            </FormField>
            <FormField label="Hekim notu" htmlFor="hd-rx-note" hint="İsteğe bağlı — reçetede görünür.">
              <Textarea id="hd-rx-note" rows={1} maxLength={1000} value={rxNote} onChange={(event) => setRxNote(event.target.value)} placeholder="Kullanım talimatı, uyarılar" />
            </FormField>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void save()} loading={saving}>Reçeteyi kaydet</Button>
          </div>
        </section>
      )}

      <ListTable
        header={<h2 className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-800">Yazılan reçeteler</h2>}
        columns={historyColumns}
        rows={history}
        rowKey={(row) => row.rx.id}
        rowClassName={(row) => (isVoid(row.rx) ? "opacity-70" : "")}
        emptyIcon={Pill}
        emptyText="Henüz reçete yazılmamış"
        mobileCard={(row) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${isVoid(row.rx) ? "text-slate-400 line-through" : "text-slate-800"}`}>{drugNames(row) || "Reçete"}</p>
              <p className="text-xs text-slate-500">{[formatDateText(row.rx.createdAt), row.rx.doctor?.fullName, isVoid(row.rx) ? "İptal edildi" : ""].filter(Boolean).join(" · ")}</p>
            </div>
            {rowActions(row)}
          </div>
        )}
      />
    </div>
  );
}
