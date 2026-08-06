"use client";

/* eslint-disable @next/next/no-img-element */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, Search, UserPlus } from "lucide-react";
import { showToastSafe } from "@/lib/toast-client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { createSceneIllustration } from "@/components/ui/SceneIllustration";

const StaffEmptyIcon = createSceneIllustration("personel");

type Staff = {
  id: string;
  fullName: string;
  identityNo: string;
  institution: string;
  role: string;
  isActive: boolean;
  profile?: { workStart?: string; workEnd?: string; photoUrl?: string | null; hideAsDoctor?: boolean } | null;
};

// "Doktor olarak göster" işaretli bir yönetici, randevu/hakediş ekranlarında
// zaten tam bir doktor gibi işlem görüyordu — personel listesindeki sayım ve
// gruplama bununla tutarsızdı (yönetici grubunda görünüp diş hekimi sayısına
// hiç yansımıyordu). Buradaki grup/sayım da aynı kuralı kullanır.
const effectiveGroupRole = (p: Staff) =>
  p.role === "DOKTOR" || (p.role === "YONETICI" && p.profile?.hideAsDoctor === false) ? "DOKTOR" : p.role;

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

const roleLabel: Record<string, string> = {
  YONETICI: "Yönetici",
  DOKTOR: "Diş Hekimi",
  ASISTAN: "Asistan",
  BANKO: "Banko Personeli",
  MUHASEBE: "Muhasebe",
};

export default function PersonelPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "aktif" | "pasif">("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff");
      if (!res.ok) throw new Error("Personeller alınamadı");
      setStaff(await res.json());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      setError(msg);
      try { showToastSafe({ title: 'Hata', message: msg, type: 'error' }); } catch {}
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = staff.filter((person) =>
    (!filterRole || effectiveGroupRole(person) === filterRole) &&
    (!filterStatus || (filterStatus === "aktif" ? person.isActive : !person.isActive)) &&
    (!search || person.fullName.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR")) || person.identityNo.includes(search))
  );

  const columns: ListTableColumn<Staff>[] = [
    {
      key: "personel",
      header: "Personel",
      render: (person) => (
        <div className="flex min-w-0 items-center gap-3">
          {person.profile?.photoUrl ? (
            <img
              src={person.profile.photoUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-cover"
            />
          ) : (
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-xs font-bold text-primary">
              {initials(person.fullName) || "P"}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{person.fullName}</p>
            <p className="mt-0.5 text-xs text-slate-500">{person.identityNo}</p>
          </div>
        </div>
      ),
    },
    {
      key: "unvan",
      header: "Unvan",
      render: (person) => roleLabel[effectiveGroupRole(person)] || person.role,
    },
    {
      key: "calisma",
      header: "Çalışma saatleri",
      render: (person) => person.profile?.workStart && person.profile?.workEnd
        ? `${person.profile.workStart} - ${person.profile.workEnd}`
        : <span className="text-slate-400">Belirtilmedi</span>,
    },
    {
      key: "durum",
      header: "Durum",
      render: (person) => (
        <Badge tone={person.isActive ? "success" : "critical"}>
          {person.isActive ? "Aktif" : "Pasif"}
        </Badge>
      ),
    },
    {
      key: "islem",
      header: "",
      align: "right",
      render: () => (
        <ChevronRight className="ml-auto h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
      ),
    },
  ];

  return (
    <section className="space-y-3">
      <PageHeader
        icon="person"
        title="Personel"
        description="Ekip yetkilerini, çalışma saatlerini ve aktif personel durumunu yönetin."
        stats={[
          { label: "Kişi", value: staff.length },
          { label: "Aktif", value: staff.filter((person) => person.isActive).length, color: "text-emerald-700" },
        ]}
        actions={<Button icon={UserPlus} href="/personel-ekle">Yeni Personel Ekle</Button>}
      />

      <div className="ui-toolbar flex flex-wrap items-center gap-2 p-2.5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ad veya TC kimlik ara" className="w-full rounded-md border border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm placeholder-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
          <option value="">Tüm Unvanlar</option>
          <option value="YONETICI">Yönetici</option>
          <option value="DOKTOR">Diş Hekimi</option>
          <option value="ASISTAN">Asistan</option>
          <option value="BANKO">Banko Personeli</option>
          <option value="MUHASEBE">Muhasebe</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as "" | "aktif" | "pasif")} className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
          <option value="">Tüm Durumlar</option>
          <option value="aktif">Aktif</option>
          <option value="pasif">Pasif</option>
        </select>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      <ListTable
        columns={columns}
        rows={filtered}
        rowKey={(person) => person.id}
        loading={loading}
        skeletonRows={7}
        emptyText="Aramanızla eşleşen personel bulunamadı"
        emptyIcon={StaffEmptyIcon} emptyIllustrative
        emptyAccent="violet"
        onRowClick={(person) => router.push(`/personel-ekle?id=${person.id}`)}
        getRowAriaLabel={(person) => `${person.fullName} personel kaydını aç`}
      />
    </section>
  );
}
