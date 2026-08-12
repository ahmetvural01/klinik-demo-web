"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Crown, MapPin, Pencil, Plus, Power, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { showToastSafe } from "@/lib/toast-client";

type Manager = { id: string; fullName: string; role: string };
type Branch = {
  id: string; name: string; code: string | null; phone: string | null; email: string | null;
  address: string | null; district: string | null; city: string | null; colorCode: string;
  isHeadquarters: boolean; isActive: boolean;
  memberships: { userId: string; user: { fullName: string } }[];
  _count: { memberships: number; appointments: number; clinicUnits: number };
};

const EMPTY = { name: "", code: "", phone: "", email: "", address: "", district: "", city: "", colorCode: "#0f766e", managerIds: [] as string[] };
const COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#d97706", "#dc2626"];
const inputClass = "h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10";

export function BranchControlPanel({ institutionId }: { institutionId: string }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [managerQuery, setManagerQuery] = useState("");
  const snapshot = useRef(JSON.stringify(EMPTY));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/superadmin/institutions/${institutionId}/branches`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.branches)) throw new Error(data?.message || "Şubeler alınamadı.");
      setBranches(data.branches);
      setManagers(Array.isArray(data.managers) ? data.managers : []);
    } catch (error) {
      showToastSafe({ title: "Şube ağı yüklenemedi", message: error instanceof Error ? error.message : "Lütfen tekrar deneyin.", type: "error" });
    } finally { setLoading(false); }
  }, [institutionId]);

  useEffect(() => { void load(); }, [load]);

  const showCreate = () => {
    setEditing(null); setForm(EMPTY); snapshot.current = JSON.stringify(EMPTY); setOpen(true);
  };
  const showEdit = (branch: Branch) => {
    const next = { name: branch.name, code: branch.code || "", phone: branch.phone || "", email: branch.email || "", address: branch.address || "", district: branch.district || "", city: branch.city || "", colorCode: branch.colorCode, managerIds: branch.memberships.map((item) => item.userId) };
    setEditing(branch); setForm(next); snapshot.current = JSON.stringify(next); setOpen(true);
  };

  const save = async () => {
    if (form.name.trim().length < 2) return showToastSafe({ title: "Şube adı eksik", message: "En az 2 karakter girin.", type: "error" });
    setSaving(true);
    try {
      const response = await fetch(`/api/superadmin/institutions/${institutionId}/branches`, {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Şube kaydedilemedi.");
      showToastSafe({ title: editing ? "Şube güncellendi" : "Şube oluşturuldu", message: form.name, type: "success" });
      setOpen(false); await load();
    } catch (error) {
      showToastSafe({ title: "Kayıt tamamlanamadı", message: error instanceof Error ? error.message : "Lütfen tekrar deneyin.", type: "error" });
    } finally { setSaving(false); }
  };

  const toggleActive = async (branch: Branch) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/superadmin/institutions/${institutionId}/branches`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: branch.id, isActive: !branch.isActive }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "Şube durumu değiştirilemedi.");
      await load();
    } catch (error) { showToastSafe({ title: "İşlem tamamlanamadı", message: error instanceof Error ? error.message : "Lütfen tekrar deneyin.", type: "error" }); }
    finally { setSaving(false); }
  };

  const visibleManagers = managers.filter((manager) => `${manager.fullName} ${manager.role}`.toLocaleLowerCase("tr-TR").includes(managerQuery.trim().toLocaleLowerCase("tr-TR")));

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-black text-slate-900">Şube Kontrol Düzlemi</h2><p className="mt-1 text-xs text-slate-500">Şube yaşam döngüsü ve yönetici bağlantıları yalnızca burada değiştirilebilir.</p></div><Button size="sm" icon={Plus} onClick={showCreate}>Yeni Şube</Button></div>
    {loading ? <div className="rounded-lg border border-slate-200 bg-white py-10 text-center text-xs font-semibold text-slate-400">Şube ağı yükleniyor...</div> : <div className="overflow-hidden rounded-lg border border-slate-200 bg-white"><table className="w-full text-left"><thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase text-slate-500"><th className="px-4 py-3">Şube</th><th className="hidden px-4 py-3 md:table-cell">Şube Yöneticileri</th><th className="hidden px-4 py-3 sm:table-cell">Kullanım</th><th className="px-4 py-3 text-right">İşlem</th></tr></thead><tbody className="divide-y divide-slate-100">{branches.map((branch) => <tr key={branch.id} className={!branch.isActive ? "opacity-55" : ""}><td className="px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md" style={{ color: branch.colorCode, backgroundColor: `${branch.colorCode}18` }}><MapPin className="h-4 w-4" /></span><div><div className="flex items-center gap-2"><b className="text-xs text-slate-900">{branch.name}</b>{branch.isHeadquarters && <Crown className="h-3.5 w-3.5 text-amber-500" />}</div><small className="text-[10px] text-slate-500">{[branch.district, branch.city].filter(Boolean).join(", ") || branch.code || "Konum bilgisi yok"}</small></div></div></td><td className="hidden px-4 py-3 md:table-cell"><div className="flex flex-wrap gap-1">{branch.memberships.length ? branch.memberships.map((item) => <span key={item.userId} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700"><ShieldCheck className="h-3 w-3" />{item.user.fullName}</span>) : <span className="text-[10px] text-amber-600">Yönetici atanmamış</span>}</div></td><td className="hidden px-4 py-3 text-[10px] text-slate-500 sm:table-cell">{branch._count.memberships} personel · {branch._count.appointments} randevu</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><Button size="sm" variant="secondary" icon={Pencil} onClick={() => showEdit(branch)}>Düzenle</Button>{!branch.isHeadquarters && <Button size="sm" variant="ghost" icon={Power} disabled={saving} onClick={() => void toggleActive(branch)}>{branch.isActive ? "Pasife Al" : "Aktifleştir"}</Button>}</div></td></tr>)}</tbody></table></div>}

    <Modal open={open} onClose={() => setOpen(false)} isDirty={open && JSON.stringify(form) !== snapshot.current} title={editing ? "Şubeyi Düzenle" : "Yeni Şube"} description="Fiziksel konumu ve bu konumun yöneticilerini tanımlayın." size="xl" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Vazgeç</Button><Button loading={saving} onClick={() => void save()}>{editing ? "Güncelle" : "Şubeyi Oluştur"}</Button></>}>
      <div className="grid gap-4 md:grid-cols-2"><FormField label="Şube Adı" required><input className={inputClass} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></FormField><FormField label="Kısa Kod"><input className={`${inputClass} uppercase`} value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} /></FormField><FormField label="Telefon"><input className={inputClass} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></FormField><FormField label="E-posta"><input className={inputClass} type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></FormField><FormField label="İl"><input className={inputClass} value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} /></FormField><FormField label="İlçe"><input className={inputClass} value={form.district} onChange={(event) => setForm((current) => ({ ...current, district: event.target.value }))} /></FormField><div className="md:col-span-2"><FormField label="Adres"><input className={inputClass} value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /></FormField></div><div className="md:col-span-2"><p className="mb-2 text-xs font-bold text-slate-700">Şube Rengi</p><div className="flex gap-2">{COLORS.map((color) => <button type="button" key={color} aria-label={color} onClick={() => setForm((current) => ({ ...current, colorCode: color }))} className={`h-8 w-8 rounded-md border-2 ${form.colorCode === color ? "border-slate-900 ring-2 ring-slate-300 ring-offset-2" : "border-white"}`} style={{ backgroundColor: color }} />)}</div></div></div>
      <div className="mt-5 border-t border-slate-200 pt-4"><div className="flex items-center justify-between gap-3"><div><h4 className="text-xs font-black text-slate-900">Şube Yöneticileri</h4><p className="mt-1 text-[11px] text-slate-500">Bu kişiler klinik Ayarlar ekranından yalnızca bu şubenin personel erişimini yönetir.</p></div><label className="flex h-9 w-56 items-center gap-2 rounded-md border border-slate-200 px-3"><Search className="h-3.5 w-3.5 text-slate-400" /><input className="min-w-0 flex-1 text-xs outline-none" value={managerQuery} onChange={(event) => setManagerQuery(event.target.value)} placeholder="Personel ara" /></label></div><div className="mt-3 grid max-h-52 gap-2 overflow-y-auto md:grid-cols-2">{visibleManagers.map((manager) => { const selected = form.managerIds.includes(manager.id); return <button key={manager.id} type="button" onClick={() => setForm((current) => ({ ...current, managerIds: selected ? current.managerIds.filter((id) => id !== manager.id) : [...current.managerIds, manager.id] }))} className={`flex items-center justify-between rounded-md border px-3 py-2 text-left ${selected ? "border-primary/30 bg-primary/5" : "border-slate-200"}`}><span><b className="block text-xs text-slate-800">{manager.fullName}</b><small className="text-[10px] text-slate-500">{manager.role}</small></span><span className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? "border-primary bg-primary text-white" : "border-slate-300 text-transparent"}`}><Check className="h-3.5 w-3.5" /></span></button>; })}</div></div>
    </Modal>
  </section>;
}
