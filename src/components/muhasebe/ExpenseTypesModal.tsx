"use client";

import { useState, type KeyboardEvent } from "react";
import { Pencil } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { FormErrorBanner } from "@/components/ui/FormField";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";
import { clientMutation } from "@/lib/client-mutation";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";

export type ExpenseCategory = { id: string; name: string; isActive: boolean; isDoctorPayout?: boolean };

// Sistemin kendi kayıtlarında adıyla aradığı türler: yeniden adlandırılırsa
// sistem aynı adla yenisini açar ve raporlarda iki ayrı satır oluşur.
const SYSTEM_CATEGORY_NAMES = new Set(["Firma Ödemesi", "Doktor Hakedişi"]);
export const isSystemCategory = (category: Pick<ExpenseCategory, "name" | "isDoctorPayout">) => Boolean(category.isDoctorPayout) || SYSTEM_CATEGORY_NAMES.has(category.name);

type Props = {
  open: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
  onChanged: () => void | Promise<unknown>;
};

/**
 * Gider türleri: ekle, yeniden adlandır, arşivle. Silme yok — eski giderlerin
 * türü raporlarda korunur; arşivlenen tür yeni giderde seçilemez. Önceden her
 * satır sürekli açık bir metin kutusuydu (pencere form yığını gibi görünüyordu);
 * artık liste, ad yalnız "Adını değiştir" ile düzenlenir ve yalnız açık
 * Kaydet/Enter ile kaydedilir.
 */
export function ExpenseTypesModal({ open, onClose, categories, onChanged }: Props) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const sorted = [...categories].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "tr"));

  async function add() {
    const name = newName.trim();
    if (!name) { setError("Tür adını yazın."); return; }
    setBusyId("new");
    setError("");
    try {
      await clientMutation("/api/gider-kategorileri", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }, "Gider türü eklenemedi.");
      setNewName("");
      showToastSafe({ message: `"${name}" gider türü eklendi.`, type: "success" });
      await onChanged();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Gider türü eklenemedi.");
    } finally {
      setBusyId("");
    }
  }

  async function rename() {
    if (!editing) return;
    const category = categories.find((item) => item.id === editing.id);
    const name = editing.name.trim();
    if (!category || !name || name === category.name) { setEditing(null); return; }
    setBusyId(category.id);
    setError("");
    try {
      await clientMutation(`/api/gider-kategorileri/${category.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }, "Gider türü güncellenemedi.");
      setEditing(null);
      showToastSafe({ message: "Gider türünün adı güncellendi.", type: "success" });
      await onChanged();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Gider türü güncellenemedi.");
    } finally {
      setBusyId("");
    }
  }

  async function toggle(category: ExpenseCategory) {
    if (category.isActive && !(await confirmDialog({
      title: "Gider türü arşivlensin mi?",
      message: `"${category.name}" yeni giderlerde seçilemeyecek. Eski giderler ve raporlar etkilenmez.`,
      confirmText: "Arşivle",
    }))) return;
    setBusyId(category.id);
    setError("");
    try {
      await clientMutation(`/api/gider-kategorileri/${category.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !category.isActive }) }, "Gider türü güncellenemedi.");
      await onChanged();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Gider türü güncellenemedi.");
    } finally {
      setBusyId("");
    }
  }

  const onEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") { event.preventDefault(); void rename(); }
    if (event.key === "Escape") {
      // Pencereyi değil yalnız ad düzenlemeyi kapatır.
      event.preventDefault();
      event.stopPropagation();
      setEditing(null);
    }
  };

  const nameCell = (category: ExpenseCategory) => (editing?.id === category.id ? (
    <Input
      size="sm"
      autoFocus
      aria-label={`${category.name} türünün yeni adı`}
      value={editing.name}
      maxLength={120}
      disabled={busyId === category.id}
      onChange={(event) => setEditing({ id: category.id, name: event.target.value })}
      onKeyDown={onEditKeyDown}
    />
  ) : (
    <span className={`font-semibold ${category.isActive ? "text-slate-800" : "text-slate-400"}`}>{category.name}</span>
  ));

  const statusBadge = (category: ExpenseCategory) => (isSystemCategory(category)
    ? <Badge tone="neutral" title="Sistem bu türü kendi kayıtlarında kullanır; adı değiştirilemez.">Sistem</Badge>
    : !category.isActive ? <Badge tone="neutral">Arşivde</Badge> : null);

  const actions = (category: ExpenseCategory) => {
    if (isSystemCategory(category)) return null;
    if (editing?.id === category.id) {
      return (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={busyId === category.id}>Vazgeç</Button>
          <Button size="sm" loading={busyId === category.id} onClick={() => void rename()}>Kaydet</Button>
        </div>
      );
    }
    return (
      <div className="flex justify-end gap-1.5">
        {category.isActive && <IconButton icon={Pencil} title="Adını değiştir" size="sm" disabled={Boolean(busyId)} onClick={() => setEditing({ id: category.id, name: category.name })} />}
        <Button size="sm" variant={category.isActive ? "danger-ghost" : "ghost"} loading={busyId === category.id} disabled={Boolean(busyId) && busyId !== category.id} onClick={() => void toggle(category)}>
          {category.isActive ? "Arşivle" : "Geri al"}
        </Button>
      </div>
    );
  };

  const columns: ListTableColumn<ExpenseCategory>[] = [
    { key: "ad", header: "Gider türü", render: nameCell },
    { key: "durum", header: "", render: (category) => statusBadge(category) },
    { key: "islem", header: "", align: "right", render: actions },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gider türleri"
      description="Giderler raporda bu türlere göre gruplanır."
      size="md"
      module="finance"
      trackFormChanges={false}
      footer={<Button variant="secondary" onClick={onClose}>Kapat</Button>}
    >
      <div className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void add(); }}
        >
          <Input aria-label="Yeni gider türü adı" value={newName} maxLength={120} placeholder="Yeni tür adı (örn. Kira)" onChange={(event) => setNewName(event.target.value)} />
          <Button type="submit" variant="secondary" loading={busyId === "new"}>Ekle</Button>
        </form>
        <FormErrorBanner message={error} />
        <ListTable
          columns={columns}
          rows={sorted}
          rowKey={(category) => category.id}
          emptyText="Henüz gider türü yok"
          emptyDescription="İlk türü yukarıdan ekleyin; gider girerken yazdığınız yeni türler de buraya eklenir."
          mobileCard={(category) => (
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="min-w-0 flex-1">{nameCell(category)}</div>
                {statusBadge(category)}
              </div>
              {actions(category)}
            </div>
          )}
        />
      </div>
    </Modal>
  );
}
