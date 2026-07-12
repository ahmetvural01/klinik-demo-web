"use client";

import { SearchSelect } from "@/components/ui/SearchSelect";

type Option = { id: string; label: string; meta?: string };

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

const fieldClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none";

/**
 * Laboratuvar iş oluşturma formunun ortak alanları — hasta detayı ve
 * laboratuvar sayfası aynı bileşeni kullanır, aralarında sadece Hasta
 * alanının görünürlüğü (hidePatientField) değişir.
 */
export function LabOrderForm({
  hidePatientField,
  patientSearch,
  onPatientSearchChange,
  patientOptions,
  onPatientSelect,
  doctorSearch,
  onDoctorSearchChange,
  doctorOptions,
  onDoctorSelect,
  labSearch,
  onLabSearchChange,
  labOptions,
  onLabSelect,
  hasKnownLabs,
  labTypeSearch,
  onLabTypeSearchChange,
  labTypeOptions,
  onLabTypeSelect,
  teethSelector,
  sentItem,
  onSentItemChange,
  sentItemQuickPicks,
  requestedItem,
  onRequestedItemChange,
  showImpressionMethod,
  impressionMethod,
  onImpressionMethodChange,
  notes,
  onNotesChange,
}: {
  hidePatientField?: boolean;
  patientSearch?: string;
  onPatientSearchChange?: (value: string) => void;
  patientOptions?: Option[];
  onPatientSelect?: (option: Option) => void;
  doctorSearch: string;
  onDoctorSearchChange: (value: string) => void;
  doctorOptions: Option[];
  onDoctorSelect: (option: Option) => void;
  labSearch: string;
  onLabSearchChange: (value: string) => void;
  labOptions: Option[];
  onLabSelect: (option: Option) => void;
  hasKnownLabs: boolean;
  labTypeSearch: string;
  onLabTypeSearchChange: (value: string) => void;
  labTypeOptions: Option[];
  onLabTypeSelect: (option: Option) => void;
  teethSelector?: React.ReactNode;
  sentItem: string;
  onSentItemChange: (value: string) => void;
  sentItemQuickPicks?: React.ReactNode;
  requestedItem: string;
  onRequestedItemChange: (value: string) => void;
  showImpressionMethod: boolean;
  impressionMethod: string;
  onImpressionMethodChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      {!hidePatientField && (
        <Field label="Hasta *">
          <SearchSelect
            query={patientSearch || ""}
            onQueryChange={onPatientSearchChange || (() => {})}
            options={patientOptions || []}
            onSelect={onPatientSelect || (() => {})}
            placeholder="Hasta adı yazın..."
            emptyText="Hasta bulunamadı"
            className={fieldClass}
          />
        </Field>
      )}
      <Field label="Doktor *">
        <SearchSelect
          query={doctorSearch}
          onQueryChange={onDoctorSearchChange}
          options={doctorOptions}
          onSelect={onDoctorSelect}
          placeholder="Doktor adı yazın..."
          emptyText="Doktor bulunamadı"
          className={fieldClass}
        />
      </Field>
      <Field
        label="Laboratuvar Adı *"
        hint="Liste, Firma Kartları ekranında Laboratuvar olarak işaretlenen firmalardan gelir."
      >
        <SearchSelect
          query={labSearch}
          onQueryChange={onLabSearchChange}
          options={labOptions}
          onSelect={onLabSelect}
          placeholder={hasKnownLabs ? "Laboratuvar adı yazın..." : "Firma kartlarında laboratuvar tanımlı değil"}
          emptyText="Firma Kartları'nda laboratuvar olarak işaretli firma yok"
          className={fieldClass}
        />
      </Field>
      <Field label="İş Türü *">
        <SearchSelect
          query={labTypeSearch}
          onQueryChange={onLabTypeSearchChange}
          options={labTypeOptions}
          onSelect={onLabTypeSelect}
          placeholder="İş türü yazın..."
          emptyText="İş türü bulunamadı"
          className={fieldClass}
        />
      </Field>
      {teethSelector && <Field label="Diş Seçimi (opsiyonel)">{teethSelector}</Field>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Gönderilen">
          <input
            value={sentItem}
            onChange={(e) => onSentItemChange(e.target.value)}
            className={fieldClass}
            placeholder="Ölçü, kaşık…"
          />
          {sentItemQuickPicks}
        </Field>
        <Field label="Laboratuvardan Beklenen">
          <input
            value={requestedItem}
            onChange={(e) => onRequestedItemChange(e.target.value)}
            className={fieldClass}
            placeholder="Metal alt yapı, prova…"
          />
        </Field>
      </div>
      {showImpressionMethod && (
        <Field label="Ölçü Yöntemi">
          <select value={impressionMethod} onChange={(e) => onImpressionMethodChange(e.target.value)} className={fieldClass}>
            <option value="">Seçiniz</option>
            <option value="KLASIK_OLCU">Klasik Ölçü</option>
            <option value="DIJITAL_TARAMA">Dijital Tarama</option>
          </select>
        </Field>
      )}
      <Field label="Not">
        <textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} rows={2} className={fieldClass} />
      </Field>
    </div>
  );
}
