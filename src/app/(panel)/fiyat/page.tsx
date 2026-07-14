"use client";

import { useEffect, useMemo, useState } from "react";
import { showToastSafe } from "@/lib/toast-client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ListTable, type ListTableColumn } from "@/components/ui/ListTable";

type Price = { id: string; code: string; treatment: string; amount: number; isCustom: boolean; isTemplate?: boolean; catalogYear?: number };
type PriceMeta = { activeCatalogYear: number; latestPublishedYear: number; updateAvailable: boolean; officialPdfUrl: string };

const ACTIVE_PRICE_LIST_STORAGE_KEY = "klinikmodern-active-price-list";

function PriceTable({ title, prices, isCustom, favorites, toggleFav, onEdit, onDelete, onAdd, loading }: {
	title: string;
	prices: Price[];
	isCustom: boolean;
	favorites?: Set<string>;
	toggleFav?: (id: string) => void;
	onEdit?: (p: Price) => void;
	onDelete?: (id: string) => void;
	onAdd?: (code: string, treatment: string, amount: string) => void;
	loading?: boolean;
}) {
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const pageSize = 15;
	const [newCode, setNewCode] = useState("");
	const [newTreatment, setNewTreatment] = useState("");
	const [newAmount, setNewAmount] = useState("");
	const [addErr, setAddErr] = useState("");

	const filtered = useMemo(
		() => prices.filter((p) => !search || p.treatment.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())),
		[prices, search]
	);
	const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
	const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

	const columns: ListTableColumn<Price>[] = [
		...(isCustom && favorites ? [{
			key: "fav",
			header: "Favori",
			align: "center" as const,
			render: (p: Price) => (
				<button onClick={() => toggleFav && toggleFav(p.id)} aria-label="Favori fiyat" className={"text-lg " + (favorites.has(p.id) ? "text-yellow-500" : "text-gray-300") + " hover:text-yellow-400"}>&#9733;</button>
			),
		}] : []),
		{ key: "code", header: "Kod", render: (p) => <span className="font-mono text-xs text-slate-500">{p.code}</span> },
		{ key: "treatment", header: "Tedavi Adı", render: (p) => <span className="font-medium text-slate-800">{p.treatment}</span> },
		{ key: "amount", header: "Ücret", align: "right", render: (p) => <span className="font-bold text-slate-800">{Number(p.amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</span> },
		...(isCustom ? [{
			key: "islem",
			header: "İşlem",
			align: "center" as const,
			render: (p: Price) => (
				<div className="flex justify-center gap-1.5">
					<Button variant="secondary" size="sm" onClick={() => onEdit && onEdit(p)}>Düzenle</Button>
					{!p.isTemplate && <Button variant="danger" size="sm" onClick={() => onDelete && onDelete(p.id)}>Sil</Button>}
				</div>
			),
		}] : []),
	];

	return (
		<div className="min-w-0 space-y-3">
			<div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
				<div>
					<h3 className="text-base font-black text-slate-900">{title}</h3>
					<p className="mt-0.5 text-xs text-slate-500">Tedavi seçerken görünen fiyat kayıtları</p>
				</div>
				<span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">{filtered.length} kayıt</span>
			</div>
			<div className="border-b border-slate-100 px-4 py-3">
				<input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Tedavi adı veya kod ile ara" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20" />
			</div>
			{isCustom && onAdd && (
				<div className="space-y-3 border-b border-amber-100 bg-amber-50/70 px-4 py-3">
					<p className="text-sm font-bold text-amber-900">Yeni özel fiyat ekle</p>
					<div className="grid gap-2 sm:grid-cols-[90px_minmax(180px,1fr)_130px_auto]">
						<input placeholder="Kod" value={newCode} onChange={(e) => setNewCode(e.target.value)} className="rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:border-amber-500" />
						<input placeholder="Tedavi adı" value={newTreatment} onChange={(e) => setNewTreatment(e.target.value)} className="rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:border-amber-500" />
						<input placeholder="Fiyat (TL)" type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} className="rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:border-amber-500" />
						<Button variant="primary" onClick={() => { if (!newCode || !newTreatment || !newAmount) { setAddErr("Tüm alanları doldurun"); return; } setAddErr(""); onAdd(newCode, newTreatment, newAmount); setNewCode(""); setNewTreatment(""); setNewAmount(""); }}>Fiyat Ekle</Button>
					</div>
					{addErr && <p className="text-xs text-red-600">{addErr}</p>}
				</div>
			)}
			</div>
			<ListTable<Price>
				columns={columns}
				rows={rows}
				rowKey={(p) => p.id}
				loading={loading}
				emptyText="Aradığınız fiyat bulunamadı"
				pager={{
					page,
					pageCount: totalPages,
					pageSize,
					total: filtered.length,
					onPageChange: setPage,
				}}
			/>
		</div>
	);
}

async function readJsonArray(response: Response) {
	const text = response.ok ? await response.text() : "[]";
	try {
		const parsed = text ? JSON.parse(text) : [];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function FiyatManagement() {
	const [standardPrices, setStandardPrices] = useState<Price[]>([]);
	const [customPrices, setCustomPrices] = useState<Price[]>([]);
	const [loading, setLoading] = useState(false);
	const [activeList, setActiveList] = useState<"standard" | "custom">("standard");
	const [favorites, setFavorites] = useState<Set<string>>(new Set());
	const [editItem, setEditItem] = useState<Price | null>(null);
	const [editAmount, setEditAmount] = useState("");
	const [priceMeta, setPriceMeta] = useState<PriceMeta | null>(null);

	const showToast = (type: "success" | "error", text: string) => {
		showToastSafe({ message: text, type });
	};

	useEffect(() => {
		const stored = window.localStorage.getItem(ACTIVE_PRICE_LIST_STORAGE_KEY);
		if (stored === "standard" || stored === "custom") setActiveList(stored);
		void loadSettings();
		void loadAll();
	}, []);

	const loadSettings = async () => {
		try {
			const res = await fetch("/api/settings", { cache: "no-store" });
			const settings = res.ok ? await res.json() : null;
			if (settings?.activePriceList === "standard" || settings?.activePriceList === "custom") {
				setActiveList(settings.activePriceList);
				window.localStorage.setItem(ACTIVE_PRICE_LIST_STORAGE_KEY, settings.activePriceList);
			}
		} catch {}
	};

	const changeActiveList = async (next: "standard" | "custom") => {
		setActiveList(next);
		window.localStorage.setItem(ACTIVE_PRICE_LIST_STORAGE_KEY, next);
		try {
			const res = await fetch("/api/settings", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ activePriceList: next }),
			});
			if (!res.ok) throw new Error("settings");
			showToast("success", next === "custom" ? "Özel fiyat listesi aktif edildi" : "TDB 2026 tarifesi aktif edildi");
		} catch {
			showToast("error", "Fiyat kaynağı kaydedilemedi");
		}
	};

	const loadAll = async () => {
		setLoading(true);
		try {
			const [stdRes, custRes, metaRes] = await Promise.all([fetch("/api/prices?type=standard"), fetch("/api/prices?type=custom"), fetch("/api/prices?meta=1")]);
			const [std, cust] = await Promise.all([readJsonArray(stdRes), readJsonArray(custRes)]);
			setStandardPrices(std as Price[]);
			setCustomPrices(cust as Price[]);
			if (metaRes.ok) setPriceMeta(await metaRes.json());
		} catch {
			setStandardPrices([]);
			setCustomPrices([]);
		} finally {
			setLoading(false);
		}
	};

	const addCustom = async (code: string, treatment: string, amount: string) => {
		const res = await fetch("/api/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, treatment, amount: parseFloat(amount), isCustom: true }) });
		if (res.ok) {
			showToast("success", "Fiyat eklendi");
			void loadAll();
		} else {
			showToast("error", "Fiyat eklenemedi");
		}
	};

	const deletePrice = async (id: string) => {
		await fetch("/api/prices/" + id, { method: "DELETE" });
		void loadAll();
	};

	const saveEdit = async () => {
		if (!editItem || !editAmount) return;
		const isTemplate = editItem.isTemplate || editItem.id.startsWith("custom-template-") || editItem.id.startsWith("tdb-");
		const res = isTemplate
			? await fetch("/api/prices", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ code: editItem.code, treatment: editItem.treatment, amount: parseFloat(editAmount), isCustom: true }),
				})
			: await fetch("/api/prices/" + editItem.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: parseFloat(editAmount) }) });
		if (res.ok) {
			setEditItem(null);
			setEditAmount("");
			showToast("success", "Fiyat güncellendi");
			void loadAll();
		} else {
			showToast("error", "Güncelleme başarısız");
		}
	};

	const toggleFav = (id: string) => setFavorites((prev) => {
		const next = new Set(prev);
		next.has(id) ? next.delete(id) : next.add(id);
		return next;
	});

	return (
		<section className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
				<div className="flex flex-wrap items-center gap-2">
					<h1 className="text-lg font-black text-slate-900">Fiyat Listesi</h1>
					<Badge tone={activeList === "custom" ? "warning" : "info"} size="md">
						{activeList === "custom" ? "Özel liste" : "TDB tarife"}
					</Badge>
				</div>
				<div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
					<button onClick={() => void changeActiveList("standard")} className={`rounded-lg px-4 py-2 text-sm font-bold ${activeList === "standard" ? "bg-white text-primary shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>TDB Tarifesi</button>
					<button onClick={() => void changeActiveList("custom")} className={`rounded-lg px-4 py-2 text-sm font-bold ${activeList === "custom" ? "bg-white text-orange-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>Özel Liste</button>
				</div>
			</div>
			<div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary-strong">
				TDB Tarifesi, Türk Dişhekimleri Birliği {priceMeta?.activeCatalogYear ?? 2026} rehber tarife değerleriyle gösterilir. Bu seçim kurum ayarıdır; hasta kartında tedavi ekleyen tüm personel aynı aktif listeyi görür.
				{priceMeta?.updateAvailable && <span className="ml-1 font-bold">Yeni TDB {priceMeta.latestPublishedYear} listesi yayımlanmış görünüyor; katalog güncellemesi gerekli.</span>}
			</div>
			{editItem && (
				<div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
					<div className="flex flex-wrap items-center gap-3">
						<div className="text-sm font-semibold text-primary-strong">Fiyat güncelle</div>
						<div className="text-sm text-primary">{editItem.code} - {editItem.treatment}</div>
						<input value={editAmount} onChange={(e) => setEditAmount(e.target.value)} type="number" className="w-36 rounded border px-3 py-2 text-sm" />
						<Button size="sm" onClick={() => void saveEdit()}>Kaydet</Button>
						<Button variant="secondary" size="sm" onClick={() => { setEditItem(null); setEditAmount(""); }}>Vazgeç</Button>
					</div>
				</div>
			)}
			{activeList === "standard" ? (
				<PriceTable title="TDB Tarife Fiyatları" prices={standardPrices} isCustom={false} loading={loading} />
			) : (
				<PriceTable title="Özel Fiyatlar" prices={customPrices} isCustom={true} favorites={favorites} toggleFav={toggleFav} onEdit={(p) => { setEditItem(p); setEditAmount(String(p.amount)); }} onDelete={deletePrice} onAdd={addCustom} loading={loading} />
			)}
		</section>
	);
}

export default function FiyatPage() {
	return <FiyatManagement />;
}
