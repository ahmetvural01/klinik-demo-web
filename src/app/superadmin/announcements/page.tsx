"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EyeOff, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, useTabParam } from "@/components/ui/Tabs";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { ChoiceCards } from "@/components/ui/ChoiceCards";
import { SearchableListbox } from "@/components/ui/SearchableListbox";
import { EmptyValue, ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { createModuleEmptyIcon } from "@/components/ui/ModuleIcon";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { turkeyDayRangeUtc } from "@/lib/tz";
import { shortDate, todayKey } from "@/components/superadmin/sa-format";
import { errorMessage, isAbort, saGet, saSend } from "@/components/superadmin/sa-fetch";

const AnnouncementEmptyIcon = createModuleEmptyIcon("clipboard");
const MAX_TEXT = 2000;

type Group = {
  key: string;
  ids: string[];
  text: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  createdBy: string | null;
  targets: { id: string; name: string; active: boolean }[];
  activeCount: number;
};

type ClinicAnnouncement = {
  id: string;
  text: string;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  institution: { id: string; name: string } | null;
};

type Clinic = { id: string; name: string; isActive: boolean };

const SCOPE_KEYS = ["platform", "klinik"] as const;

function publishState(item: { isActiveCount: number; startsAt: string | null; endsAt: string | null }): { label: string; tone: BadgeTone } {
  const now = Date.now();
  if (item.isActiveCount === 0) return { label: "Yayından kaldırıldı", tone: "neutral" };
  if (item.endsAt && new Date(item.endsAt).getTime() < now) return { label: "Süresi doldu", tone: "neutral" };
  if (item.startsAt && new Date(item.startsAt).getTime() > now) return { label: "Zamanlandı", tone: "info" };
  return { label: "Yayında", tone: "success" };
}

function rangeText(startsAt: string | null, endsAt: string | null): string {
  const start = startsAt ? shortDate(startsAt) : "Hemen";
  const end = endsAt ? shortDate(endsAt) : "süresiz";
  return `${start} – ${end}`;
}

/**
 * Duyurular — platformdan kliniklerin ana sayfasına gönderilen mesajlar. Tüm
 * kliniklere gönderilen tek duyuru tek satırdır ("Hedef: 7 klinik"), tek
 * tıkla hepsinden kaldırılır. Kliniklerin kendi iç duyuruları ayrı sekmede.
 */
export default function AnnouncementsPage() {
  const [scope, setScope] = useTabParam(SCOPE_KEYS, "platform", "kapsam");
  const [groups, setGroups] = useState<Group[]>([]);
  const [clinicItems, setClinicItems] = useState<ClinicAnnouncement[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeClinicCount, setActiveClinicCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [targetMode, setTargetMode] = useState<"all" | "selected">("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [clinicsLoading, setClinicsLoading] = useState(false);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => { setPage(1); }, [scope]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    const apiScope = scope === "klinik" ? "clinic" : "platform";
    saGet<{ groups?: Group[]; announcements?: ClinicAnnouncement[]; total: number; totalPages: number; activeClinicCount?: number }>(
      `/api/superadmin/announcements?scope=${apiScope}&page=${page}`, "Duyurular yüklenemedi.", controller.signal,
    )
      .then((data) => {
        setGroups(Array.isArray(data?.groups) ? data.groups : []);
        setClinicItems(Array.isArray(data?.announcements) ? data.announcements : []);
        setTotal(data?.total ?? 0);
        setTotalPages(data?.totalPages ?? 1);
        if (typeof data?.activeClinicCount === "number") setActiveClinicCount(data.activeClinicCount);
      })
      .catch((error) => {
        if (!isAbort(error)) setLoadError(errorMessage(error, "Duyurular yüklenemedi."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [scope, page, reloadKey]);

  const loadClinics = () => {
    if (clinics.length > 0 || clinicsLoading) return;
    setClinicsLoading(true);
    saGet<Clinic[]>("/api/superadmin/institutions", "Klinik listesi alınamadı.")
      .then((data) => setClinics((Array.isArray(data) ? data : []).filter((item) => item.isActive)))
      .catch((error) => setFormError(errorMessage(error, "Klinik listesi alınamadı.")))
      .finally(() => setClinicsLoading(false));
  };

  const openCreate = () => {
    setFormError(null);
    setOpen(true);
  };

  const resetForm = () => {
    setText("");
    setTargetMode("all");
    setSelectedIds([]);
    setStartDate("");
    setEndDate("");
  };

  const publish = async () => {
    if (!text.trim()) return setFormError("Duyuru metnini yazın.");
    if (targetMode === "selected" && selectedIds.length === 0) return setFormError("En az bir klinik seçin.");
    if (startDate && endDate && startDate > endDate) return setFormError("Bitiş tarihi başlangıçtan önce olamaz.");
    setSaving(true);
    setFormError(null);
    try {
      const result = await saSend<{ created: number; skipped?: number }>("/api/superadmin/announcements", "POST", {
        text: text.trim(),
        allInstitutions: targetMode === "all",
        institutionIds: targetMode === "selected" ? selectedIds : [],
        startsAt: startDate ? turkeyDayRangeUtc(startDate).start.toISOString() : null,
        endsAt: endDate ? turkeyDayRangeUtc(endDate).end.toISOString() : null,
      }, "Duyuru yayınlanamadı.");
      showToastSafe({ type: "success", message: `Duyuru ${result.created} kliniğe gönderildi.${result.skipped ? ` ${result.skipped} kapalı klinik atlandı.` : ""}`, icon: "log" });
      resetForm();
      setOpen(false);
      if (scope !== "platform") setScope("platform");
      setPage(1);
      reload();
    } catch (error) {
      setFormError(errorMessage(error, "Duyuru yayınlanamadı."));
    } finally {
      setSaving(false);
    }
  };

  const unpublish = async (ids: string[], key: string, label: string) => {
    const ok = await confirmDialog({
      title: "Duyuru yayından kaldırılsın mı?",
      message: `${label} Kayıt silinmez, yalnız kliniklerde artık gösterilmez.`,
      confirmText: "Yayından kaldır",
      cancelText: "Vazgeç",
      danger: true,
    });
    if (!ok) return;
    setBusyKey(key);
    try {
      const result = await saSend<{ deactivated: number }>(`/api/superadmin/announcements?ids=${ids.map(encodeURIComponent).join(",")}`, "DELETE", undefined, "Duyuru kaldırılamadı.");
      showToastSafe({ type: "success", message: `Duyuru ${result.deactivated} klinikte kaldırıldı.` });
      reload();
    } catch (error) {
      showToastSafe({ type: "error", message: errorMessage(error, "Duyuru kaldırılamadı.") });
    } finally {
      setBusyKey(null);
    }
  };

  const targetText = (group: Group) => {
    if (activeClinicCount != null && group.targets.length >= activeClinicCount && group.targets.length > 1) return `Tüm klinikler (${group.targets.length})`;
    if (group.targets.length <= 2) return group.targets.map((target) => target.name).join(", ");
    return `${group.targets.length} klinik`;
  };

  const groupState = (group: Group) => publishState({ isActiveCount: group.activeCount, startsAt: group.startsAt, endsAt: group.endsAt });

  const groupColumns: ListTableColumn<Group>[] = [
    { key: "text", header: "Duyuru", render: (group) => <p className="line-clamp-2 max-w-xl text-sm text-slate-800">{group.text}</p> },
    {
      key: "target",
      header: "Hedef",
      render: (group) => (
        <span className="text-sm text-slate-700" title={group.targets.map((target) => target.name).join(", ")}>
          {targetText(group)}
          {group.activeCount > 0 && group.activeCount < group.targets.length && <span className="block text-xs text-slate-500">{group.activeCount} klinikte yayında</span>}
        </span>
      ),
    },
    { key: "range", header: "Yayın aralığı", render: (group) => <span className="whitespace-nowrap text-sm text-slate-600">{rangeText(group.startsAt, group.endsAt)}</span> },
    { key: "status", header: "Durum", render: (group) => { const state = groupState(group); return <Badge tone={state.tone}>{state.label}</Badge>; } },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (group) => group.activeCount > 0
        ? <IconButton icon={EyeOff} title="Yayından kaldır" tone="danger" size="sm" disabled={busyKey === group.key} onClick={() => void unpublish(group.ids, group.key, `Duyuru ${group.activeCount} kliniğin ana sayfasından kaldırılacak.`)} />
        : <span />,
    },
  ];

  const clinicColumns: ListTableColumn<ClinicAnnouncement>[] = [
    { key: "clinic", header: "Klinik", render: (item) => <span className="font-semibold text-slate-900">{item.institution?.name ?? "—"}</span> },
    { key: "text", header: "Duyuru", render: (item) => <p className="line-clamp-2 max-w-xl text-sm text-slate-700">{item.text}</p> },
    { key: "createdAt", header: "Tarih", render: (item) => shortDate(item.createdAt) || <EmptyValue /> },
    { key: "status", header: "Durum", render: (item) => { const state = publishState({ isActiveCount: item.isActive ? 1 : 0, startsAt: item.startsAt, endsAt: item.endsAt }); return <Badge tone={state.tone}>{state.label}</Badge>; } },
  ];

  const clinicOptions = useMemo(() => clinics.map((item) => ({ id: item.id, label: item.name })), [clinics]);
  const pager = { page, pageCount: totalPages, pageSize: 20, total, onPageChange: setPage };

  return (
    <section className="space-y-4">
      <PageHeader
        icon="clipboard"
        title="Duyurular"
        description="Kliniklerin ana sayfasında görünen platform duyuruları."
        actions={<Button icon={Plus} onClick={openCreate}>Yeni duyuru</Button>}
      />

      <Tabs
        ariaLabel="Duyuru türü"
        size="sm"
        value={scope}
        onChange={setScope}
        items={[
          { key: "platform", label: "Platform duyuruları" },
          { key: "klinik", label: "Kliniklerin kendi duyuruları" },
        ]}
      />

      {scope === "platform" ? (
        <ListTable<Group>
          columns={groupColumns}
          rows={groups}
          rowKey={(group) => group.key}
          loading={loading}
          error={loadError}
          onRetry={reload}
          emptyText="Henüz duyuru yayınlanmadı"
          emptyDescription="Tüm kliniklere veya seçtiğiniz kliniklere duyuru göndermek için “Yeni duyuru”yu kullanın."
          emptyIcon={AnnouncementEmptyIcon}
          emptyIllustrative
          pager={pager}
          mobileCard={(group) => {
            const state = groupState(group);
            return (
              <div className="space-y-1.5">
                <p className="line-clamp-3 text-sm text-slate-800">{group.text}</p>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>{targetText(group)} · {rangeText(group.startsAt, group.endsAt)}</span>
                  <span className="flex items-center gap-1.5">
                    <Badge tone={state.tone}>{state.label}</Badge>
                    {group.activeCount > 0 && <IconButton icon={EyeOff} title="Yayından kaldır" tone="danger" size="sm" disabled={busyKey === group.key} onClick={() => void unpublish(group.ids, group.key, `Duyuru ${group.activeCount} kliniğin ana sayfasından kaldırılacak.`)} />}
                  </span>
                </div>
              </div>
            );
          }}
        />
      ) : (
        <>
          <p className="text-sm text-slate-500">Klinik yöneticilerinin kendi personeline yazdığı duyurular (yalnız görüntüleme).</p>
          <ListTable<ClinicAnnouncement>
            columns={clinicColumns}
            rows={clinicItems}
            rowKey={(item) => item.id}
            loading={loading}
            error={loadError}
            onRetry={reload}
            emptyText="Kliniklerin iç duyurusu yok"
            pager={pager}
            mobileCard={(item) => (
              <div className="space-y-1">
                <p className="font-semibold text-slate-900">{item.institution?.name ?? "—"}</p>
                <p className="line-clamp-2 text-sm text-slate-700">{item.text}</p>
                <p className="text-xs text-slate-500">{shortDate(item.createdAt)}</p>
              </div>
            )}
          />
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Yeni duyuru"
        description="Duyuru seçilen kliniklerin ana sayfasında görünür."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button loading={saving} onClick={() => void publish()}>Yayınla</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormErrorBanner message={formError} />
          <FormField label="Duyuru metni" htmlFor="announcement-text" required hint={`${text.length} / ${MAX_TEXT} karakter`}>
            <Textarea id="announcement-text" rows={4} maxLength={MAX_TEXT} value={text} onChange={(event) => setText(event.target.value)} placeholder="Ör. 12 Ekim gecesi 02:00-03:00 arası bakım çalışması yapılacaktır." />
          </FormField>
          <ChoiceCards
            label="Kimlere gönderilsin?"
            variant="pills"
            value={targetMode}
            onChange={(value) => {
              setTargetMode(value);
              if (value === "selected") loadClinics();
            }}
            options={[
              { value: "all", label: activeClinicCount != null ? `Tüm açık klinikler (${activeClinicCount})` : "Tüm açık klinikler" },
              { value: "selected", label: "Seçtiğim klinikler" },
            ]}
          />
          {targetMode === "selected" && (
            <FormField label="Klinikler" required hint="Kapalı klinikler listede yer almaz">
              <SearchableListbox
                options={clinicOptions}
                value={selectedIds}
                onChange={setSelectedIds}
                multiple
                loading={clinicsLoading}
                onOpen={loadClinics}
                placeholder="Klinik seçin"
                searchPlaceholder="Klinik ara"
                selectedLabel="klinik"
                allSelectedLabel="Tüm açık klinikler seçildi"
                emptyText="Bu adla klinik yok"
              />
            </FormField>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Yayın başlangıcı" htmlFor="announcement-start" hint="Boş = hemen">
              <Input id="announcement-start" type="date" min={todayKey()} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </FormField>
            <FormField label="Yayın bitişi" htmlFor="announcement-end" hint="Boş = siz kaldırana kadar">
              <Input id="announcement-end" type="date" min={startDate || todayKey()} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </FormField>
          </div>
        </div>
      </Modal>
    </section>
  );
}
