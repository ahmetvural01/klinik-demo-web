"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Pill, Plus, Printer, Trash2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { FormModal, submitIntent } from "@/components/ui/FormModal";
import { ListTable, EmptyValue, type ListTableColumn } from "@/components/ui/ListTable";
import { FormField } from "@/components/ui/FormField";
import { Input, Textarea } from "@/components/ui/Input";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { formatDateText } from "@/components/ui/Money";
import { DoctorSelect } from "@/components/staff/DoctorSelect";
import { MEDICATION_TEMPLATES, medicationMatches } from "@/lib/medications";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { usePatientFile } from "./PatientFileContext";
import { errorMessageOf, healthFlagsOf, newIdempotencyKey, type Rx } from "./patient-file-shared";

type Drug = { key: string; name: string; dose: string; usage: string; duration: string; note: string };

const FREE_OPTION_PREFIX = "__serbest__:";

function parseDrugs(raw: string): Omit<Drug, "key">[] {
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
let drugKeySeed = 0;
const nextDrugKey = () => `ilac-${(drugKeySeed += 1)}`;

/**
 * Reçete sekmesi: yazılan reçeteler ve "Yeni reçete" penceresi. Pencere
 * sekmeden ya da üstteki "İşlem ekle > Reçete yaz"dan açılır. Önceden form
 * sekmenin en üstünde hep açıktı (geçmişe bakan kullanıcı formu geçiyordu),
 * yalnız 10 sabit ilaç seçilebiliyor, doz/kullanım/süre değiştirilemiyordu.
 */
export function PrescriptionTab() {
  const { data, patientId, reload, can, intent, clearIntent, lockDoctorToSelf, currentUserId } = usePatientFile();
  const canWrite = can("prescriptions:write");
  // Doktor yalnız kendi yazdığı reçeteyi iptal eder (sunucu kuralı).
  const canVoid = (rx: Rx) => canWrite && !isVoid(rx) && (!lockDoctorToSelf || rx.doctor?.id === currentUserId);
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState("");

  // "İşlem ekle > Reçete yaz": yeni reçete penceresi açılır.
  useEffect(() => {
    if (intent !== "rx") return;
    clearIntent();
    if (canWrite) setFormOpen(true);
  }, [intent, clearIntent, canWrite]);

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
      <IconButton icon={Printer} title="Reçeteyi aç / yazdır" size="sm" href={`/recete?id=${row.rx.id}&patientId=${patientId}`} />
      {canVoid(row.rx) && <IconButton icon={XCircle} title="Reçeteyi iptal et" tone="danger" size="sm" disabled={busyId === row.rx.id} onClick={() => void voidPrescription(row.rx)} />}
    </div>
  );

  const drugsCell = (row: HistoryRow) => (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={isVoid(row.rx) ? "text-slate-400 line-through" : "text-slate-800"}>{drugNames(row) || <EmptyValue />}</span>
      {isVoid(row.rx) && <Badge tone="neutral">İptal edildi</Badge>}
    </span>
  );

  const historyColumns: ListTableColumn<HistoryRow>[] = [
    { key: "date", header: "Tarih", render: (row) => <span className="whitespace-nowrap">{formatDateText(row.rx.createdAt)}</span> },
    { key: "drugs", header: "İlaçlar", render: drugsCell },
    { key: "doctor", header: "Hekim", render: (row) => row.rx.doctor?.fullName || <EmptyValue /> },
    { key: "actions", header: "", align: "right", render: rowActions },
  ];

  return (
    <div className="space-y-4">
      <ListTable
        title="Reçeteler"
        actions={canWrite ? <Button size="sm" variant="secondary" icon={Plus} onClick={() => setFormOpen(true)}>Yeni reçete</Button> : undefined}
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

      {formOpen && <PrescriptionFormModal onClose={() => setFormOpen(false)} />}
    </div>
  );
}

function PrescriptionFormModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { data, patientId, reload, doctors, currentUserId, recentDoctorId, treatingDoctorIds, lockDoctorToSelf } = usePatientFile();
  const [query, setQuery] = useState("");
  const [drugs, setDrugs] = useState<Drug[]>([]);
  // Reçeteyi yazan hekim: oturumdaki kişi hekimse kendisi, değilse hastayı en
  // son tedavi eden hekim (tedavi formuyla aynı kural); kullanıcı değiştirebilir.
  // Doktor rolünde reçete yalnız kendi adına yazılır (yasal belge; sunucu kuralı).
  const [doctorChoice, setDoctorChoice] = useState<string | null>(null);
  const defaultDoctorId = lockDoctorToSelf || doctors.some((doctor) => doctor.id === currentUserId) ? currentUserId : recentDoctorId;
  const doctorId = lockDoctorToSelf ? currentUserId : doctorChoice ?? defaultDoctorId;
  const [rxNote, setRxNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const requestKeyRef = useRef("");
  // "Kaydet" ve "Kaydet ve yazdır" aynı kaydı başlatır; hızlı çift tıklama ikinci istek atmasın.
  const savingRef = useRef(false);

  const doctorName = doctors.find((doctor) => doctor.id === doctorId)?.fullName || "";
  // Kimlikle karşılaştırılır (sunucu bakiyesinden de gelir): tedavileri
  // göremeyen rolde de uyarı çalışır, aynı adlı iki hekim karışmaz.
  const doctorMismatch = Boolean(doctorId && treatingDoctorIds.length > 0 && !treatingDoctorIds.includes(doctorId));

  // İlaç yazarken hastanın riskleri gözünün önünde olsun.
  const riskFlags = healthFlagsOf(data);
  const showRisk = riskFlags.length > 0 || Boolean(data.medications);

  const options = useMemo(() => {
    const text = query.trim();
    const normalized = text.toLocaleLowerCase("tr-TR");
    // Hazır ilaçlar adıyla ya da etken maddesiyle bulunur ("Amok" → Augmentin):
    // önceden yalnız ad aranıyor, yanlışlıkla "Amok" adlı serbest ilaç eklenebiliyordu.
    const matches = MEDICATION_TEMPLATES
      .filter((item) => medicationMatches(item, text))
      .map((item) => ({ id: item.id, label: `${item.name} ${item.dose}`, meta: [item.ingredient, item.usage, item.duration].filter(Boolean).join(" · ") }));
    const exact = MEDICATION_TEMPLATES.some((item) => item.name.toLocaleLowerCase("tr-TR") === normalized);
    // Listede olmayan ilaç da yazılabilir (reçete ilaçları serbest metin olarak
    // saklanır); seçenek her zaman en altta ve "listede yok" diye ayrı durur.
    return text.length >= 2 && !exact
      ? [...matches, { id: `${FREE_OPTION_PREFIX}${text}`, label: `Listede yok: “${text}” ekle`, meta: "Serbest ilaç · doz, kullanım ve süreyi aşağıda yazın" }]
      : matches;
  }, [query]);

  const addDrug = (optionId: string) => {
    if (optionId.startsWith(FREE_OPTION_PREFIX)) {
      const name = optionId.slice(FREE_OPTION_PREFIX.length).trim();
      if (name) setDrugs((current) => [...current, { key: nextDrugKey(), name, dose: "", usage: "", duration: "", note: "" }]);
    } else {
      const template = MEDICATION_TEMPLATES.find((item) => item.id === optionId);
      if (template) setDrugs((current) => [...current, { key: nextDrugKey(), name: template.name, dose: template.dose, usage: template.usage, duration: template.duration, note: "" }]);
    }
    setQuery("");
    setErrors((current) => ({ ...current, drugs: "" }));
  };

  const updateDrug = (key: string, patch: Partial<Drug>) => setDrugs((current) => current.map((drug) => (drug.key === key ? { ...drug, ...patch } : drug)));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    if (savingRef.current) return;
    // "Kaydet ve yazdır" ortak ikincil gönder düğmesidir: kayıt sürerken yalnız
    // basılan düğme "yükleniyor" görünür (FormModal secondarySubmit).
    const printAfterSave = submitIntent(event) === "print";
    const next: Record<string, string> = {};
    const cleaned = drugs
      .map(({ key: _key, ...drug }) => ({ name: drug.name.trim(), dose: drug.dose.trim(), usage: drug.usage.trim(), duration: drug.duration.trim(), note: drug.note.trim() }))
      .filter((drug) => drug.name);
    if (cleaned.length === 0) next.drugs = "En az bir ilaç ekleyin.";
    if (!doctorId) next.doctor = "Reçeteyi yazan hekimi seçin.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      // Aynı anahtarla tekrar gönderim (çift tıklama, ağ hatasında yeniden deneme) ikinci reçete açmaz.
      if (!requestKeyRef.current) requestKeyRef.current = newIdempotencyKey("rx");
      const response = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current },
        body: JSON.stringify({ patientId, drugs: JSON.stringify(cleaned), note: rxNote.trim(), doctorId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessageOf(body, "Reçete kaydedilemedi."));
      requestKeyRef.current = "";
      showToastSafe({ type: "success", icon: "clipboard", message: "Reçete kaydedildi." });
      void reload(true);
      onClose();
      const createdId = body && typeof body === "object" && typeof (body as { id?: unknown }).id === "string" ? (body as { id: string }).id : "";
      // yazdir=1: reçete sayfası yüklenince yazdırma penceresini bir kez açar.
      if (printAfterSave && createdId) router.push(`/recete?id=${encodeURIComponent(createdId)}&patientId=${encodeURIComponent(patientId)}&yazdir=1`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Reçete kaydedilemedi.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Enter: listede tek eşleşen hazır ilaç varsa onu, hiç eşleşme yoksa yazılan
  // adı ekler; birden çok eşleşmede seçim beklenir. Enter hiçbir durumda
  // yarım reçeteyi kaydetmez.
  const onDrugKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return;
    const target = event.target as HTMLElement;
    if (target.id !== "hd-rx-drug" || target.getAttribute("aria-activedescendant")) return;
    if (!query.trim()) return;
    event.preventDefault();
    const templates = options.filter((option) => !option.id.startsWith(FREE_OPTION_PREFIX));
    const free = options.find((option) => option.id.startsWith(FREE_OPTION_PREFIX));
    if (templates.length === 1) addDrug(templates[0].id);
    else if (templates.length === 0 && free) addDrug(free.id);
  };

  return (
    <FormModal
      open
      onClose={onClose}
      module="clipboard"
      title="Yeni reçete"
      description={data.fullName}
      size="lg"
      onSubmit={save}
      submitting={saving}
      error={error}
      isDirty={drugs.length > 0 || Boolean(rxNote.trim())}
      secondarySubmit={{ label: "Kaydet ve yazdır", intent: "print", icon: Printer }}
    >
      {showRisk && (
        <Callout tone="warning" title={riskFlags.length > 0 ? `Dikkat: ${riskFlags.join(", ")}` : "Kullandığı ilaçlar var"}>
          {data.medications ? `Kullandığı ilaçlar: ${data.medications}` : "Ayrıntı için Özet > Hasta bilgileri."}
        </Callout>
      )}

      <FormField label="İlaç" htmlFor="hd-rx-drug" error={errors.drugs || undefined}>
        <div onKeyDownCapture={onDrugKeyDown}>
          <SearchSelect
            id="hd-rx-drug"
            query={query}
            onQueryChange={setQuery}
            options={options}
            onSelect={(option) => addDrug(option.id)}
            placeholder="İlaç adı yazın (listede yoksa da eklenir)"
            emptyText="Eşleşen hazır ilaç yok — adını yazmaya devam edin"
          />
        </div>
      </FormField>

      {drugs.length > 0 && (
        <ol className="space-y-2" aria-label="Reçetedeki ilaçlar">
          {drugs.map((drug, index) => (
            <li key={drug.key} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold text-slate-800">{index + 1}. {drug.name}</p>
                <IconButton icon={Trash2} title={`${drug.name} ilacını çıkar`} tone="danger" size="sm" onClick={() => setDrugs((current) => current.filter((item) => item.key !== drug.key))} />
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,0.7fr)]">
                <Input size="sm" aria-label={`${drug.name} dozu`} placeholder="Doz (ör. 500 mg)" maxLength={80} value={drug.dose} onChange={(event) => updateDrug(drug.key, { dose: event.target.value })} />
                <Input size="sm" aria-label={`${drug.name} kullanımı`} placeholder="Kullanım (ör. 8 saatte 1)" maxLength={120} value={drug.usage} onChange={(event) => updateDrug(drug.key, { usage: event.target.value })} />
                <Input size="sm" aria-label={`${drug.name} süresi`} placeholder="Süre (ör. 5 gün)" maxLength={60} value={drug.duration} onChange={(event) => updateDrug(drug.key, { duration: event.target.value })} />
                <Input size="sm" className="sm:col-span-3" aria-label={`${drug.name} notu`} placeholder="İlaca özel not (isteğe bağlı, ör. tok karnına)" maxLength={200} value={drug.note} onChange={(event) => updateDrug(drug.key, { note: event.target.value })} />
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Reçeteyi yazan hekim"
          htmlFor="hd-rx-doctor"
          required
          error={errors.doctor || undefined}
          hint={lockDoctorToSelf ? "Reçeteyi yalnız kendi adınıza yazabilirsiniz." : doctorMismatch ? "Bu hekim hastayı tedavi edenler arasında değil — kontrol edin." : undefined}
          hintTone={!lockDoctorToSelf && doctorMismatch ? "warning" : "neutral"}
        >
          {lockDoctorToSelf
            ? <Input id="hd-rx-doctor" readOnly value={doctorName || "Kendi adınıza"} />
            : <DoctorSelect id="hd-rx-doctor" value={doctorId} doctors={doctors} onChange={(id) => setDoctorChoice(id)} />}
        </FormField>
        <FormField label="Reçete notu (tanı / talimat)" htmlFor="hd-rx-note">
          <Textarea id="hd-rx-note" rows={2} maxLength={1000} value={rxNote} onChange={(event) => setRxNote(event.target.value)} />
        </FormField>
      </div>
    </FormModal>
  );
}
