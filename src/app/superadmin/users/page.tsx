"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { Badge } from "@/components/ui/Badge";

type User = {
  id: string;
  fullName: string;
  identityNo: string;
  role: string;
  institution?: { name: string };
  isActive: boolean;
  createdAt: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/superadmin/users")
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d) ? d : d.users ?? []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(
    (u) =>
      u.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      u.identityNo?.includes(search) ||
      u.institution?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const columns: ListTableColumn<User>[] = [
    {
      key: "fullName",
      header: "Ad Soyad",
      render: (u) => <span className="font-bold text-slate-900">{u.fullName}</span>,
    },
    {
      key: "identityNo",
      header: "TC Kimlik",
      render: (u) => <span className="font-mono text-slate-600">{u.identityNo}</span>,
    },
    {
      key: "role",
      header: "Rol",
      render: (u) => (
        <Badge tone={u.role === "DOCTOR" ? "info" : u.role === "ADMIN" ? "warning" : "neutral"}>
          {u.role}
        </Badge>
      ),
    },
    {
      key: "institution",
      header: "Klinik",
      render: (u) => <span className="text-slate-600">{u.institution?.name ?? "—"}</span>,
    },
    {
      key: "isActive",
      header: "Durum",
      render: (u) => (
        <Badge tone={u.isActive ? "success" : "critical"}>{u.isActive ? "Aktif" : "Pasif"}</Badge>
      ),
    },
    {
      key: "createdAt",
      header: "Kayıt",
      render: (u) => <span className="text-slate-500">{new Date(u.createdAt).toLocaleDateString("tr-TR")}</span>,
    },
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-black text-slate-900">Kullanıcılar</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
            {filtered.length} kullanıcı
          </span>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Ad, TC veya klinik ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-3 text-sm placeholder-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <ListTable
        columns={columns}
        rows={filtered}
        rowKey={(u) => u.id}
        loading={loading}
        emptyText="Kullanıcı bulunamadı"
      />
    </section>
  );
}
