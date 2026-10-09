"use client";

import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { LAB_LABELS } from "@/lib/lab-workflow";

type Option = { id: string; label: string; meta?: string };

/**
 * Hasta dosyasındaki "Yeni lab işi" formunun alanları (eski arama kutulu
 * sürüm). Laboratuvar sayfası artık LabNewOrderModal kullanır; hasta dosyası
 * da ona geçince bu bileşen kaldırılabilir. Alan adları ve görünüm ortak
 * bileşenlerle (FormField, Input, Select) aynı tutulur.
 */
export function LabOrderForm({
  hidePatientField,
  patientSearch,
  onPatientSearchChange,
  patientOptions,
  onPatientSelect,
  patientLoading,
  patientError,
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
  patientLoading?: boolean;
  patientError?: string;
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
        <FormField label="Hasta" required>
          <SearchSelect
            query={patientSearch || ""}
            onQueryChange={onPatientSearchChange || (() => {})}
            options={patientOptions || []}
            onSelect={onPatientSelect || (() => {})}
            placeholder="Hasta adı yazın…"
            emptyText="Hasta bulunamadı"
            loading={patientLoading}
            error={patientError}
            className="ui-control"
          />
        </FormField>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={LAB_LABELS.doctor} required hint="Lab gideri bu hekimin hakedişinden düşülür.">
          <SearchSelect
            query={doctorSearch}
            onQueryChange={onDoctorSearchChange}
            options={doctorOptions}
            onSelect={onDoctorSelect}
            placeholder="Hekim adı yazın…"
            emptyText="Hekim bulunamadı"
            className="ui-control"
          />
        </FormField>
        <FormField
          label={LAB_LABELS.lab}
          required
          hint={hasKnownLabs ? undefined : `Laboratuvarlar “${LAB_LABELS.firmScreen}” ekranında Laboratuvar türünde firma olarak tanımlanır.`}
        >
          <SearchSelect
            query={labSearch}
            onQueryChange={onLabSearchChange}
            options={labOptions}
            onSelect={onLabSelect}
            placeholder={hasKnownLabs ? "Laboratuvar adı yazın…" : "Tanımlı laboratuvar yok"}
            emptyText="Bu adla laboratuvar yok"
            className="ui-control"
          />
        </FormField>
      </div>
      <FormField label="İş türü" required>
        <SearchSelect
          query={labTypeSearch}
          onQueryChange={onLabTypeSearchChange}
          options={labTypeOptions}
          onSelect={onLabTypeSelect}
          placeholder="İş türü yazın…"
          emptyText="İş türü bulunamadı"
          className="ui-control"
        />
      </FormField>
      {teethSelector && <FormField label="Dişler" hint="İsteğe bağlı">{teethSelector}</FormField>}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Gönderilen" required>
          <Input value={sentItem} onChange={(e) => onSentItemChange(e.target.value)} placeholder="Ölçü, kaşık…" maxLength={80} />
          {sentItemQuickPicks}
        </FormField>
        <FormField label="Laboratuvardan beklenen">
          <Input value={requestedItem} onChange={(e) => onRequestedItemChange(e.target.value)} placeholder="Alt yapı, prova…" maxLength={80} />
        </FormField>
      </div>
      {showImpressionMethod && (
        <FormField label="Ölçü yöntemi">
          <Select value={impressionMethod} onChange={(e) => onImpressionMethodChange(e.target.value)}>
            <option value="">Belirtilmedi</option>
            <option value="KLASIK_OLCU">Klasik ölçü</option>
            <option value="DIJITAL_TARAMA">Dijital tarama</option>
          </Select>
        </FormField>
      )}
      <FormField label="Not">
        <Textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} rows={2} maxLength={1500} />
      </FormField>
    </div>
  );
}
