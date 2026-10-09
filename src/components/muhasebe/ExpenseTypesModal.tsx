"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormErrorBanner } from "@/components/ui/FormField";
import { clientMutation } from "@/lib/client-mutation";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";

export type ExpenseCategory = { id: string; name: string; isActive: boolean; isDoctorPayout?: boolean };

// Sistemin kendi kayıtlarında adıyla aradığı türler: yeniden adlandırılırsa
// sistem aynı adla yenisini açar ve raporlarda iki ayrı satır oluşur.
const SYSTEM_CATEGORY_NAMES = new Set(["Firma Ödemesi", "Doktor Hakedişi"]);
const isSystemCategory = (category: ExpenseCategory) => Boolean(category.isDoctorPayout) || SYSTEM_CATEGORY_NAMES.has(category.name);

type Props = {
  open: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
  onChanged: () => void | Promise<unknown>;
};

/**
 * Gider türleri: ekle, yeniden adlandır, arşivle. Silme yok — eski giderlerin
 * türü raporlarda korunur; arşivlenen tür yeni giderde seçilemez.
 */
export function ExpenseTypesModal({ open, onClose, categories, onChanged }: Props) {
  const [newName, setNewName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
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

  async function rename(category: ExpenseCategory) {
    const name = (drafts[category.id] ?? category.name).trim();
    if (!name || name === category.name) return;
    setBusyId(category.id);
    setError("");
    try {
      await clientMutation(`/api/gider-kategorileri/${category.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }, "Gider türü güncellenemedi.");
      setDrafts((current) => { const next = { ...current }; delete next[category.id]; return next; });
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gider türleri"
      description="Giderleri raporda gruplamak için kullanılır. Adı değiştirmek için yeni adı yazıp Kaydet'e basın."
      size="md"
      module="finance"
      trackFormChanges={false}
      footer={<Button variant="secondary" onClick={onClose}>Kapat</Button>}
    >
      <div className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(event) => { event.preventDefault(); void add(); }}
        >
          <Input aria-label="Yeni gider türü adı" value={newName} maxLength={120} placeholder="Yeni tür adı (örn. Kira)" onChange={(event) => setNewName(event.target.value)} />
          <Button type="submit" variant="secondary" loading={busyId === "new"}>Ekle</Button>
        </form>
        <FormErrorBanner message={error} />
        {sorted.length === 0 ? (
          <EmptyState title="Henüz gider türü yok" description="İlk türü yukarıdan ekleyin; gider girerken yazdığınız yeni türler de buraya eklenir." compact />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {sorted.map((category) => {
              const system = isSystemCategory(category);
              return (
                <li key={category.id} className="flex items-center gap-2 px-3 py-2">
                  {system ? (
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{category.name}</span>
                  ) : (
                    <Input
                      size="sm"
                      aria-label={`${category.name} türünün adı`}
                      value={drafts[category.id] ?? category.name}
                      disabled={!category.isActive || busyId === category.id}
                      onChange={(event) => setDrafts((current) => ({ ...current, [category.id]: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") { event.preventDefault(); void rename(category); }
                        if (event.key === "Escape" && drafts[category.id] !== undefined) {
                          event.preventDefault();
                          event.stopPropagation();
                          setDrafts((current) => { const next = { ...current }; delete next[category.id]; return next; });
                        }
                      }}
                      className="flex-1"
                    />
                  )}
                  {/* Ad değişikliği yalnız açıkça "Kaydet"e (ya da Enter'a) basılınca kaydedilir;
                      önceden kutudan çıkmak bile sormadan kaydediyordu. */}
                  {!system && drafts[category.id] !== undefined && drafts[category.id].trim() !== category.name && (
                    <Button size="sm" loading={busyId === category.id} onClick={() => void rename(category)}>Kaydet</Button>
                  )}
                  {system ? (
                    <Badge tone="neutral" title="Sistem bu türü kendi kayıtlarında kullanır; adı değiştirilemez.">Sistem</Badge>
                  ) : !category.isActive ? (
                    <Badge tone="neutral">Arşivde</Badge>
                  ) : null}
                  {!system && (
                    <Button size="sm" variant="ghost" loading={busyId === category.id} onClick={() => void toggle(category)}>
                      {category.isActive ? "Arşivle" : "Geri al"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
