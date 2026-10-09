"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Power, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { Switch } from "@/components/ui/Switch";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { Toolbar } from "@/components/ui/Toolbar";
import { SearchInput } from "@/components/ui/SearchInput";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { createModuleEmptyIcon } from "@/components/ui/ModuleIcon";
import { SmsMessageEditor } from "@/components/sms/SmsMessageEditor";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { SMS_PLACEHOLDERS, renderSmsPreview, toReadableText, toStoredText } from "@/lib/sms-template-placeholders";
import { PROFESSIONS } from "@/lib/professions";
import { TabIntro } from "@/components/superadmin/TabIntro";
import { codeFromTitle } from "@/components/superadmin/sa-labels";
import { errorMessage, isAbort, saGet, saSend } from "@/components/superadmin/sa-fetch";
import {
  DAYS_IN_MONTH,
  MONTH_NAMES,
  RULE_LABELS,
  WEEKDAY_NAMES,
  describeSchedule,
  formatDateKey,
  nextCelebrationDate,
  parseDateList,
  toTrDate,
  type CelebrationRule,
} from "@/components/superadmin/celebration-date";

type CelebrationDay = {
  id: string;
  code: string;
  title: string;
  month: number;
  day: number;
  recurrenceRule: string;
  weekOfMonth: number | null;
  weekday: number | null;
  dateOverrides: string[];
  targetProfessions: string[];
  messageTemplate: string;
  isActive: boolean;
  isBuiltIn: boolean;
  enabledClinicCount: number;
};

type FormState = {
  title: string;
  rule: CelebrationRule;
  month: number;
  day: number;
  weekOfMonth: number;
  weekday: number;
  datesText: string;
  targetProfessions: string[];
  messageTemplate: string;
  isActive: boolean;
};

const EMPTY: FormState = { title: "", rule: "FIXED", month: 1, day: 1, weekOfMonth: 2, weekday: 0, datesText: "", targetProfessions: [], messageTemplate: "", isActive: true };
const CelebrationEmptyIcon = createModuleEmptyIcon("sms");

/**
 * Kutlama günleri kataloğu (tüm klinikler için ortak). Klinikler hangi günde
 * hastalarına mesaj gideceğini kendi Ayarlar ekranından seçer; burada eklemek
 * kendiliğinden mesaj göndermez. Liste gerçek gönderim kuralını ve sonraki
 * gönderim tarihini gösterir; yerleşik günler silinmez, pasife alınır.
 */
export default function CelebrationDaysTab() {
  const [days, setDays] = useState<CelebrationDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CelebrationDay | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    saGet<CelebrationDay[]>("/api/superadmin/celebration-days", "Kutlama günleri yüklenemedi.", controller.signal)
      .then((data) => setDays(Array.isArray(data) ? data : []))
      .catch((error) => {
        if (!isAbort(error)) setLoadError(errorMessage(error, "Kutlama günleri yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return days
      .filter((item) => !q || item.title.toLocaleLowerCase("tr-TR").includes(q) || item.targetProfessions.some((p) => p.toLocaleLowerCase("tr-TR").includes(q)))
      .map((item) => ({ ...item, next: nextCelebrationDate(item) }))
      .sort((a, b) => (a.next ?? "9999").localeCompare(b.next ?? "9999"));
  }, [days, query]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (item: CelebrationDay) => {
    setEditing(item);
    setForm({
      title: item.title,
      rule: (["FIXED", "NTH_WEEKDAY", "DATE_OVERRIDES"].includes(item.recurrenceRule) ? item.recurrenceRule : "FIXED") as CelebrationRule,
      month: item.month,
      day: item.day,
      weekOfMonth: item.weekOfMonth ?? 1,
      weekday: item.weekday ?? 0,
      datesText: item.dateOverrides.map(toTrDate).join("\n"),
      targetProfessions: item.targetProfessions,
      messageTemplate: toReadableText(item.messageTemplate),
      isActive: item.isActive,
    });
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) return setFormError("Günün adını yazın.");
    if (!form.messageTemplate.trim()) return setFormError("Mesaj metnini yazın.");
    let schedule: Record<string, unknown> = { recurrenceRule: form.rule, month: form.month, day: Math.min(form.day, DAYS_IN_MONTH[form.month - 1]) };
    if (form.rule === "NTH_WEEKDAY") schedule = { ...schedule, day: 1, weekOfMonth: form.weekOfMonth, weekday: form.weekday };
    if (form.rule === "DATE_OVERRIDES") {
      const parsed = parseDateList(form.datesText);
      if (parsed.invalid.length > 0) return setFormError(`Şu tarihler okunamadı: ${parsed.invalid.join(", ")}. Her satıra gg.aa.yyyy yazın.`);
      if (parsed.dates.length === 0) return setFormError("En az bir tarih yazın (her satıra bir tarih).");
      const [, firstMonth, firstDay] = parsed.dates[0].split("-").map(Number);
      schedule = { recurrenceRule: form.rule, month: firstMonth, day: firstDay, dateOverrides: parsed.dates };
    }
    const payload = {
      title: form.title.trim(),
      ...schedule,
      targetProfessions: form.targetProfessions,
      messageTemplate: toStoredText(form.messageTemplate),
      isActive: form.isActive,
    };
    setSaving(true);
    setFormError(null);
    try {
      if (editing) await saSend("/api/superadmin/celebration-days", "PUT", { id: editing.id, ...payload }, "Kutlama günü kaydedilemedi.");
      else await saSend("/api/superadmin/celebration-days", "POST", { code: codeFromTitle(form.title) || `GUN_${Date.now()}`, ...payload }, "Kutlama günü kaydedilemedi.");
      showToastSafe({ type: "success", message: `${payload.title} kaydedildi.`, icon: "sms" });
      setOpen(false);
      reload();
    } catch (error) {
      setFormError(errorMessage(error, "Kutlama günü kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: CelebrationDay) => {
    if (item.isActive) {
      const ok = await confirmDialog({
        title: "Kutlama günü durdurulsun mu?",
        message: `"${item.title}" hiçbir klinikte gönderilmez.${item.enabledClinicCount > 0 ? ` Şu an ${item.enabledClinicCount} klinik bu günü açmış; tercihleri korunur, yeniden aktif ettiğinizde gönderim sürer.` : ""}`,
        confirmText: "Durdur",
        cancelText: "Vazgeç",
        danger: true,
      });
      if (!ok) return;
    }
    setBusyId(item.id);
    try {
      await saSend("/api/superadmin/celebration-days", "PUT", { id: item.id, isActive: !item.isActive }, "Durum değiştirilemedi.");
      showToastSafe({ type: "success", message: item.isActive ? `${item.title} durduruldu.` : `${item.title} yeniden aktif.`, icon: "sms" });
      reload();
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Durum değiştirilemedi.") });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: CelebrationDay) => {
    const ok = await confirmDialog({
      title: "Kutlama günü silinsin mi?",
      message: `"${item.title}" katalogdan kalıcı olarak silinir.${item.enabledClinicCount > 0 ? ` Bu günü açmış ${item.enabledClinicCount} kliniğin tercihi de silinir.` : ""} Yalnız durdurmak istiyorsanız Vazgeç deyip “Durdur”u kullanın.`,
      confirmText: "Sil",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (!ok) return;
    setBusyId(item.id);
    try {
      await saSend(`/api/superadmin/celebration-days?id=${encodeURIComponent(item.id)}`, "DELETE", undefined, "Silinemedi.");
      showToastSafe({ type: "success", message: `${item.title} silindi.`, icon: "sms" });
      reload();
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Silinemedi.") });
    } finally {
      setBusyId(null);
    }
  };

  const nextCell = (item: CelebrationDay & { next: string | null }) => item.next
    ? <span className="tabular-nums">{formatDateKey(item.next)}</span>
    : <Badge tone="warning" title="Tarih listesine yeni yılların tarihlerini ekleyin">Tarih listesi bitti</Badge>;

  const targetText = (item: CelebrationDay) => (item.targetProfessions.length === 0 ? "Tüm hastalar" : item.targetProfessions.join(", "));

  const actions = (item: CelebrationDay) => (
    <div className="flex items-center justify-end gap-1.5">
      <IconButton icon={Pencil} title="Düzenle" size="sm" onClick={() => openEdit(item)} />
      <IconButton icon={Power} title={item.isActive ? "Durdur" : "Yeniden aktif et"} tone={item.isActive ? "neutral" : "primary"} size="sm" disabled={busyId === item.id} onClick={() => void toggleActive(item)} />
      {!item.isBuiltIn && <IconButton icon={Trash2} title="Sil" tone="danger" size="sm" disabled={busyId === item.id} onClick={() => void remove(item)} />}
    </div>
  );

  const columns: ListTableColumn<CelebrationDay & { next: string | null }>[] = [
    {
      key: "title",
      header: "Gün",
      render: (item) => (
        <div className="min-w-0 max-w-md">
          <p className="font-semibold text-slate-900">{item.title}</p>
          <p className="truncate text-xs text-slate-500">{targetText(item)} · {renderSmsPreview(item.messageTemplate, { title: item.title })}</p>
        </div>
      ),
    },
    { key: "rule", header: "Tarih kuralı", render: (item) => <span className="text-sm text-slate-700">{describeSchedule(item)}</span> },
    { key: "next", header: "Sonraki gönderim", render: nextCell },
    { key: "clinics", header: "Açan klinik", align: "right", render: (item) => <span className="tabular-nums">{item.enabledClinicCount}</span> },
    { key: "status", header: "Durum", render: (item) => <Badge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Aktif" : "Durduruldu"}</Badge> },
    { key: "actions", header: "", align: "right", render: actions },
  ];

  const ruleOptions = (Object.keys(RULE_LABELS) as CelebrationRule[]).map((value) => ({ value, label: RULE_LABELS[value] }));
  const preview = (() => {
    if (form.rule === "DATE_OVERRIDES") {
      const parsed = parseDateList(form.datesText);
      const next = nextCelebrationDate({ month: 1, day: 1, recurrenceRule: "DATE_OVERRIDES", weekOfMonth: null, weekday: null, dateOverrides: parsed.dates });
      return next ? `Sonraki gönderim: ${formatDateKey(next)}` : parsed.dates.length > 0 ? "Listedeki tüm tarihler geçmiş; gelecek yılları ekleyin." : null;
    }
    const next = nextCelebrationDate({ month: form.month, day: form.day, recurrenceRule: form.rule, weekOfMonth: form.weekOfMonth, weekday: form.weekday, dateOverrides: [] });
    return next ? `Sonraki gönderim: ${formatDateKey(next)}` : null;
  })();

  return (
    <section className="space-y-3">
      <TabIntro
        text="Tüm klinikler için ortak liste. Her klinik hangi günde hastalarına mesaj gideceğini kendi Ayarlar ekranından seçer; buraya eklemek kendiliğinden mesaj göndermez."
        actions={<Button icon={Plus} onClick={openCreate}>Yeni gün</Button>}
      />
      <ListTable
        header={
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} placeholder="Gün adı veya meslek" wrapperClassName="flex-1 min-w-[220px]" />
          </Toolbar>
        }
        columns={columns}
        rows={rows}
        rowKey={(item) => item.id}
        loading={loading}
        error={loadError}
        onRetry={reload}
        rowClassName={(item) => (item.isActive ? "" : "opacity-60")}
        emptyText={query ? "Bu aramaya uyan gün yok" : "Henüz kutlama günü yok"}
        emptyIcon={CelebrationEmptyIcon}
        emptyIllustrative
        mobileCard={(item) => (
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-semibold text-slate-900">{item.title}</p>
              <Badge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Aktif" : "Durduruldu"}</Badge>
            </div>
            <p className="text-xs text-slate-500">{describeSchedule(item)} · {targetText(item)}</p>
            <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
              <span>Sonraki: {nextCell(item)}</span>
              {actions(item)}
            </div>
          </div>
        )}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Kutlama gününü düzenle" : "Yeni kutlama günü"}
        description={editing?.isBuiltIn ? "Yerleşik gün: silinemez, durdurulabilir." : undefined}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button loading={saving} onClick={() => void save()}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormErrorBanner message={formError} />
          <FormField label="Günün adı" htmlFor="celebration-title" required hint="Ör. 14 Mart Tıp Bayramı">
            <Input id="celebration-title" value={form.title} onChange={(event) => set("title", event.target.value)} />
          </FormField>

          <ChoiceCards label="Hangi gün gönderilsin?" variant="pills" options={ruleOptions} value={form.rule} onChange={(value) => set("rule", value)} />

          {form.rule === "FIXED" && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Ay" htmlFor="celebration-month" required>
                <Select id="celebration-month" value={form.month} onChange={(event) => { const month = Number(event.target.value); setForm((current) => ({ ...current, month, day: Math.min(current.day, DAYS_IN_MONTH[month - 1]) })); }}>
                  {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
                </Select>
              </FormField>
              <FormField label="Gün" htmlFor="celebration-day" required>
                <Select id="celebration-day" value={form.day} onChange={(event) => set("day", Number(event.target.value))}>
                  {Array.from({ length: DAYS_IN_MONTH[form.month - 1] }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
                </Select>
              </FormField>
            </div>
          )}

          {form.rule === "NTH_WEEKDAY" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="Ay" htmlFor="celebration-nth-month" required>
                <Select id="celebration-nth-month" value={form.month} onChange={(event) => set("month", Number(event.target.value))}>
                  {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
                </Select>
              </FormField>
              <FormField label="Kaçıncı hafta" htmlFor="celebration-week" required>
                <Select id="celebration-week" value={form.weekOfMonth} onChange={(event) => set("weekOfMonth", Number(event.target.value))}>
                  {[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}.</option>)}
                </Select>
              </FormField>
              <FormField label="Gün" htmlFor="celebration-weekday" required>
                <Select id="celebration-weekday" value={form.weekday} onChange={(event) => set("weekday", Number(event.target.value))}>
                  {WEEKDAY_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
                </Select>
              </FormField>
            </div>
          )}

          {form.rule === "DATE_OVERRIDES" && (
            <FormField label="Tarihler" htmlFor="celebration-dates" required hint="Her satıra bir tarih yazın (gg.aa.yyyy). Dini bayramlar gibi her yıl değişen günler için; yeni yılların tarihlerini zamanında ekleyin.">
              <Textarea id="celebration-dates" rows={5} value={form.datesText} onChange={(event) => set("datesText", event.target.value)} placeholder={"20.03.2026\n09.03.2027"} />
            </FormField>
          )}
          {preview && <p className="text-xs font-semibold text-slate-600">{preview}</p>}

          <fieldset>
            <legend className="mb-1.5 text-xs font-bold text-slate-800">Kime gönderilsin?</legend>
            <p className="mb-2 text-xs text-slate-500">Hiçbiri seçilmezse tüm hastalara; seçilirse yalnız mesleği bunlardan biri olan hastalara gider.</p>
            <div className="flex flex-wrap gap-1.5">
              {PROFESSIONS.filter((p) => p !== "Diğer").map((profession) => {
                const selected = form.targetProfessions.includes(profession);
                return (
                  <button
                    type="button"
                    key={profession}
                    aria-pressed={selected}
                    onClick={() => set("targetProfessions", selected ? form.targetProfessions.filter((item) => item !== profession) : [...form.targetProfessions, profession])}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${selected ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    {profession}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <SmsMessageEditor value={form.messageTemplate} onChange={(messageTemplate) => set("messageTemplate", messageTemplate)} placeholders={SMS_PLACEHOLDERS} />
          <Switch checked={form.isActive} onChange={(checked) => set("isActive", checked)} label="Aktif" description="Durdurulan gün hiçbir klinikte gönderilmez; kliniklerin tercihleri korunur." />
        </div>
      </Modal>
    </section>
  );
}
