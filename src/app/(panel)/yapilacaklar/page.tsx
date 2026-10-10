"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { usePermissions } from "@/components/auth/PermissionProvider";
import type { PickedPatient } from "@/components/patient/PatientPicker";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { StatusPage } from "@/components/ui/StatusPage";
import { Tabs, useTabParam, type TabItem } from "@/components/ui/Tabs";
import { FollowUpsTab, type FollowUpsTabHandle } from "./_components/FollowUpsTab";
import { TasksTab, type TasksTabHandle } from "./_components/TasksTab";
import {
  isFollowStatus,
  isTaskView,
  replaceQuery,
  type FollowStatus,
  type PageTab,
  type TaskView,
} from "./_components/query-state";

/**
 * Yapılacaklar: "Hasta aramaları" (eski Hasta Takip) ve "Ekip görevleri"
 * (eski Görevler) tek sayfada, aynı liste kalıbıyla. Sekmeler izne göre
 * görünür (hastatracking:read / clinictasks:read); birincil eylem görünen
 * sekmeye göre "Yeni arama" ya da "Yeni görev". Eski adresler (/hasta-takip,
 * /gorevler) parametreleriyle buraya yönlenir.
 */
function YapilacaklarContent() {
  const { can } = usePermissions();
  const searchParams = useSearchParams();
  const canFollowUps = can("hastatracking:read");
  const canTasks = can("clinictasks:read");
  const canWriteFollowUps = can("hastatracking:write");
  const canWriteTasks = can("clinictasks:write");
  // Varsayılan sekme: hastayı arayabilen ve ekibin tamamını yönetmeyen kişi
  // (banko) günün aramalarıyla, diğerleri (doktor, asistan, yönetici, muhasebe) görevlerle açar.
  const prefersCalls = canFollowUps && canWriteFollowUps && can("patients:phone") && !can("clinictasks:read-all");

  const allowedTabs = useMemo<PageTab[]>(() => [
    ...(canFollowUps ? (["arama"] as const) : []),
    ...(canTasks ? (["gorev"] as const) : []),
  ], [canFollowUps, canTasks]);
  const fallbackTab: PageTab = allowedTabs.length === 0 ? "gorev" : prefersCalls || !canTasks ? allowedTabs[0] : "gorev";
  const [tab] = useTabParam<PageTab>(allowedTabs, fallbackTab);

  const urlStatus = searchParams.get("durum");
  const [followStatus, setFollowStatus] = useState<FollowStatus>(() => (tab === "arama" && isFollowStatus(urlStatus) ? urlStatus : "bugun"));
  const [taskStatus, setTaskStatus] = useState<TaskView>(() => (tab === "gorev" && isTaskView(urlStatus) ? urlStatus : "yapilacak"));
  // Ziyaret edilen sekme bağlı kalır: geri dönüşte liste, süzgeç ve arama yerinde durur.
  const [visited, setVisited] = useState<ReadonlySet<PageTab>>(() => new Set([tab]));
  const followRef = useRef<FollowUpsTabHandle>(null);
  const tasksRef = useRef<TasksTabHandle>(null);
  // Henüz çizilmemiş sekmenin formunu açma isteği (derin bağlantı, "Hasta araması olarak aç").
  const pendingCreate = useRef<{ tab: PageTab; patient: PickedPatient | null; note: string } | null>(null);

  useEffect(() => {
    setVisited((current) => (current.has(tab) ? current : new Set([...current, tab])));
  }, [tab]);

  // Sayfa açıkken adres değişirse (ör. zil ya da eski /hasta-takip?tab=kapali bağlantısı) durum adresi izler.
  useEffect(() => {
    if (tab === "arama") setFollowStatus(isFollowStatus(urlStatus) ? urlStatus : "bugun");
    else setTaskStatus(isTaskView(urlStatus) ? urlStatus : "yapilacak");
  }, [tab, urlStatus]);

  const changeTab = useCallback((next: PageTab) => {
    const status = next === "arama" ? followStatus : taskStatus;
    const isDefault = next === "arama" ? status === "bugun" : status === "yapilacak";
    replaceQuery({ tab: next, durum: isDefault ? null : status });
  }, [followStatus, taskStatus]);

  const changeFollowStatus = useCallback((next: FollowStatus) => {
    setFollowStatus(next);
    replaceQuery({ durum: next === "bugun" ? null : next });
  }, []);

  const changeTaskStatus = useCallback((next: TaskView) => {
    setTaskStatus(next);
    replaceQuery({ durum: next === "yapilacak" ? null : next });
  }, []);

  /** İlgili sekmenin formunu açar; sekme henüz çizilmediyse false (bekleyen istek bir sonraki çizimde açılır). */
  const openCreateIn = useCallback((target: PageTab, request: { patient: PickedPatient | null; note: string }) => {
    if (target === "arama") {
      if (!followRef.current) return false;
      followRef.current.openCreate(request);
      return true;
    }
    if (!tasksRef.current) return false;
    tasksRef.current.openCreate({ patient: request.patient });
    return true;
  }, []);

  // Derin bağlantı: ?yeni=1&patientId=&patientName=(&not=) formu hasta seçili açar
  // (üst bar "Yeni", hasta dosyası, ana sayfa, eski /hasta-takip ve /gorevler adresleri).
  // Sayfa açıkken gelen bağlantı da çalışır; sekme ilk kez açılıyorsa form, sekme
  // çizilince açılır. Parametreler hemen silinir; sayfa yenilenince form tekrar açılmaz.
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (searchParams.get("yeni") !== "1") {
      deepLinkHandled.current = false;
      return;
    }
    if (deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    const patientId = searchParams.get("patientId");
    const patientName = searchParams.get("patientName");
    const request = { patient: patientId && patientName ? { id: patientId, fullName: patientName } : null, note: searchParams.get("not") || "" };
    if (!openCreateIn(tab, request)) pendingCreate.current = { tab, ...request };
    replaceQuery({ yeni: null, patientId: null, patientName: null, not: null });
  }, [openCreateIn, searchParams, tab]);

  // Görev formundaki "Hasta araması olarak aç": aynı sayfada Hasta aramaları'na geçip formu açar.
  const convertToFollowUp = useCallback((patient: PickedPatient, note: string) => {
    pendingCreate.current = { tab: "arama", patient, note };
    setVisited((current) => (current.has("arama") ? current : new Set([...current, "arama"])));
    changeTab("arama");
  }, [changeTab]);

  useEffect(() => {
    const pending = pendingCreate.current;
    if (!pending || pending.tab !== tab) return;
    if (openCreateIn(pending.tab, pending)) pendingCreate.current = null;
  }, [openCreateIn, tab, visited]);

  if (allowedTabs.length === 0) {
    return <StatusPage kind="forbidden" />;
  }

  const tabItems: TabItem<PageTab>[] = [
    ...(canFollowUps ? [{ key: "arama" as const, label: "Hasta aramaları" }] : []),
    ...(canTasks ? [{ key: "gorev" as const, label: "Ekip görevleri" }] : []),
  ];

  const primaryAction = tab === "arama"
    ? (canWriteFollowUps ? <Button icon={Plus} onClick={() => followRef.current?.openCreate()}>Yeni arama</Button> : undefined)
    : (canWriteTasks ? <Button icon={Plus} onClick={() => tasksRef.current?.openCreate()}>Yeni görev</Button> : undefined);

  return (
    <section className="space-y-3">
      <PageHeader icon="clipboard" title="Yapılacaklar" actions={primaryAction} />

      {tabItems.length > 1 && (
        <Tabs ariaLabel="Yapılacaklar" value={tab} onChange={changeTab} items={tabItems} panelIdPrefix="yapilacaklar" />
      )}

      {canFollowUps && visited.has("arama") && (
        <div id="yapilacaklar-arama" role="tabpanel" aria-label="Hasta aramaları" hidden={tab !== "arama"}>
          <FollowUpsTab ref={followRef} active={tab === "arama"} status={followStatus} onStatusChange={changeFollowStatus} />
        </div>
      )}
      {canTasks && visited.has("gorev") && (
        <div id="yapilacaklar-gorev" role="tabpanel" aria-label="Ekip görevleri" hidden={tab !== "gorev"}>
          <TasksTab
            ref={tasksRef}
            active={tab === "gorev"}
            status={taskStatus}
            onStatusChange={changeTaskStatus}
            onConvertToFollowUp={canFollowUps && canWriteFollowUps ? convertToFollowUp : undefined}
          />
        </div>
      )}
    </section>
  );
}

export default function YapilacaklarPage() {
  return (
    <Suspense fallback={<PageSkeleton tabs={2} toolbar body="table" rows={6} label="Yapılacaklar yükleniyor" />}>
      <YapilacaklarContent />
    </Suspense>
  );
}
