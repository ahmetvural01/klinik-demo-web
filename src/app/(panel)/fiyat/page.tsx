"use client";

import { useState, useEffect, useMemo } from "react";
import { ACTIVE_PRICE_LIST_STORAGE_KEY, CUSTOM_DENTAL_TREATMENT_TEMPLATES, TDB_2026_CORE_PRICE_CATALOG } from "@/lib/dental-treatment-catalog";

type Price = { id: string; code: string; treatment: string; amount: number; isCustom: boolean };

function PriceTable({ title, prices, isCustom, favorites, toggleFav, onEdit, onDelete, onAdd }: {
	title: string; prices: Price[]; isCustom: boolean;
	favorites?: Set<string>; toggleFav?: (id: string) => void;
	onEdit?: (p: Price) => void; onDelete?: (id: string) => void;
	onAdd?: (code: string, treatment: string, amount: string) => void;
}) {
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const pageSize = 15;
	const [newCode, setNewCode] = useState("");
	const [newTreatment, setNewTreatment] = useState("");
	const [newAmount, setNewAmount] = useState("");
	const [addErr, setAddErr] = useState("");

	const filtered = useMemo(() =>
		prices.filter(p => !search || p.treatment.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())),
		[prices, search]);
	const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
	const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

	return (
		<div className="flex-1 min-w-0 rounded-lg border bg-white overflow-hidden">
			<div className="flex items-center justify-between bg-gray-50 px-3 py-2 border-b">
				<h3 className="font-bold text-sm text-gray-700">{title}</h3>
				<span className="text-xs text-gray-400">{filtered.length} kayıt</span>
			</div>
			<div className="px-3 py-2 border-b">
				<input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Tedavi veya kod ara..." className="w-full rounded border px-2 py-1.5 text-sm" />
			</div>
			{isCustom && onAdd && (
				<div className="bg-yellow-50 border-b px-3 py-2 space-y-2">
					<p className="text-xs font-semibold text-gray-600">+ Yeni Muayene Fiyatı Ekle</p>
					<div className="flex gap-2 flex-wrap">
						<input placeholder="Kod" value={newCode} onChange={e => setNewCode(e.target.value)} className="w-16 rounded border px-2 py-1.5 text-xs" />
						<input placeholder="Muayene Adı" value={newTreatment} onChange={e => setNewTreatment(e.target.value)} className="flex-1 min-w-24 rounded border px-2 py-1.5 text-xs" />
						<input placeholder="Fiyat (₺)" type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} className="w-28 rounded border px-2 py-1.5 text-xs" />
						<button onClick={() => { if (!newCode || !newTreatment || !newAmount) { setAddErr("Tüm alanları doldurun"); return; } setAddErr(""); onAdd(newCode, newTreatment, newAmount); setNewCode(""); setNewTreatment(""); setNewAmount(""); }} className="rounded bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700">Ekle</button>
					</div>
					{addErr && <p className="text-xs text-red-600">{addErr}</p>}
				</div>
			)}
			<div className="overflow-y-auto" style={{ maxHeight: "460px" }}>
				<table className="w-full text-sm">
					<thead className="sticky top-0 bg-gray-50 border-b text-xs text-gray-500 uppercase">
						<tr>
							{isCustom && favorites && <th className="px-2 py-2 w-8 text-center">Fav</th>}
							<th className="px-2 py-2 text-left">Kod</th>
							<th className="px-2 py-2 text-left">Tedavi Adı</th>
							<th className="px-2 py-2 text-right">Ücreti (KDV Dahil)</th>
							{isCustom && <th className="px-2 py-2 text-center">İşlem</th>}
						</tr>
					</thead>
					<tbody>
						{rows.map(p => (
							<tr key={p.id} className="border-b hover:bg-gray-50">
								{isCustom && favorites && (
									<td className="px-2 py-1.5 text-center"><button onClick={() => toggleFav && toggleFav(p.id)} className={"text-base " + (favorites.has(p.id) ? "text-yellow-500" : "text-gray-300") + " hover:text-yellow-400"}>&#9733;</button></td>
								)}
								<td className="px-2 py-1.5 font-mono text-xs text-gray-500">{p.code}</td>
								<td className="px-2 py-1.5">{p.treatment}</td>
								<td className="px-2 py-1.5 text-right font-semibold">{Number(p.amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</td>
								{isCustom && (
									<td className="px-2 py-1.5">
										<div className="flex gap-1 justify-center">
											<button onClick={() => onEdit && onEdit(p)} className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-200">Düzenle</button>
											<button onClick={() => onDelete && onDelete(p.id)} className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 hover:bg-red-200">Sil</button>
										</div>
									</td>
								)}
							</tr>
						))}
						{rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-gray-400">Fiyat bulunamadı</td></tr>}
					</tbody>
				</table>
			</div>
			<div className="flex items-center justify-between border-t px-3 py-2 text-xs text-gray-500">
				<span>Sayfa {page} / {totalPages}</span>
				<div className="flex gap-1">
					<button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded border px-2 py-0.5 disabled:opacity-40 hover:bg-gray-50">&#8249;</button>
					<button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded border px-2 py-0.5 disabled:opacity-40 hover:bg-gray-50">&#8250;</button>
				</div>
			</div>
		</div>
	);
}

export default function FiyatPage() {
	const [standardPrices, setStandardPrices] = useState<Price[]>([]);
	const [customPrices, setCustomPrices] = useState<Price[]>([]);
	const [loading, setLoading] = useState(true);
	const [activeList, setActiveList] = useState<"standard" | "custom">("standard");
	const [favorites, setFavorites] = useState<Set<string>>(new Set());
	const [editItem, setEditItem] = useState<Price | null>(null);
	const [editAmount, setEditAmount] = useState("");
	const [seedLoading, setSeedLoading] = useState<"standard" | "custom" | null>(null);
	const [settingsReady, setSettingsReady] = useState(false);
	const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
	const showToast = (type: "success" | "error", text: string) => {
		setToast({ type, text }); setTimeout(() => setToast(null), 3500);
	};

	useEffect(() => {
		const loadPage = async () => {
			const stored = window.localStorage.getItem(ACTIVE_PRICE_LIST_STORAGE_KEY);
			if (stored === "standard" || stored === "custom") setActiveList(stored);

			try {
				const settingsRes = await fetch("/api/settings");
				if (settingsRes.ok) {
					const settings = await settingsRes.json();
					if (settings?.activePriceList === "standard" || settings?.activePriceList === "custom") {
						setActiveList(settings.activePriceList);
						window.localStorage.setItem(ACTIVE_PRICE_LIST_STORAGE_KEY, settings.activePriceList);
					}
				}
			} catch {}

			await loadAll();
			setSettingsReady(true);
		};

		void loadPage();
	}, []);

	useEffect(() => {
		window.localStorage.setItem(ACTIVE_PRICE_LIST_STORAGE_KEY, activeList);
	}, [activeList]);

	useEffect(() => {
		if (!settingsReady) return;

		const persistActiveList = async () => {
			try {
				await fetch("/api/settings", {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ activePriceList: activeList })
				});
			} catch {}
		};

		void persistActiveList();
	}, [activeList, settingsReady]);

	const loadAll = async () => {
		setLoading(true);
		try {
			const [stdRes, custRes] = await Promise.all([fetch("/api/prices?type=standard"), fetch("/api/prices?type=custom")]);
			const [std, cust] = await Promise.all([stdRes.json(), custRes.json()]);
			setStandardPrices(Array.isArray(std) ? std : []);
			setCustomPrices(Array.isArray(cust) ? cust : []);
		} catch (e) { console.error(e); }
		finally { setLoading(false); }
	};

	const addCustom = async (code: string, treatment: string, amount: string) => {
		const res = await fetch("/api/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, treatment, amount: parseFloat(amount), isCustom: true }) });
		if (res.ok) { showToast("success", "Fiyat eklendi"); loadAll(); } else showToast("error", "Fiyat eklenemedi");
	};

	const seedCatalog = async (target: "standard" | "custom") => {
		const source = target === "standard" ? TDB_2026_CORE_PRICE_CATALOG : CUSTOM_DENTAL_TREATMENT_TEMPLATES;
		const existingRows = target === "standard" ? standardPrices : customPrices;
		const existing = new Set(existingRows.map(item => item.code));
		const missing = source.filter(item => !existing.has(item.code));

		if (missing.length === 0) {
			showToast("success", target === "standard" ? "TDB tam liste zaten yüklü" : "Geniş özel tedavi paketi zaten yüklü");
			return;
		}

		setSeedLoading(target);
		let successCount = 0;
		let failCount = 0;

		for (const item of missing) {
			const res = await fetch("/api/prices", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					code: item.code,
					treatment: item.treatment,
					amount: item.amount,
					isCustom: target === "custom"
				})
			});
			if (res.ok) successCount++;
			else failCount++;
		}

		setSeedLoading(null);
		await loadAll();
		if (failCount > 0) showToast("error", `${successCount} kayıt eklendi, ${failCount} kayıt eklenemedi`);
		else showToast("success", target === "standard" ? `${successCount} TDB tedavisi yüklendi` : `${successCount} özel tedavi kaydı eklendi`);
	};

	const deletePrice = async (id: string) => { await fetch("/api/prices/" + id, { method: "DELETE" }); loadAll(); };

	const saveEdit = async () => {
		if (!editItem || !editAmount) return;
		const res = await fetch("/api/prices/" + editItem.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: parseFloat(editAmount) }) });
		if (res.ok) { setEditItem(null); setEditAmount(""); showToast("success", "Fiyat güncellendi"); loadAll(); } else showToast("error", "Güncelleme başarısız");
	};

	const toggleFav = (id: string) => setFavorites(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

	return (
		<section className="space-y-5">
			{/* Toast */}
			{toast && (
				<div className={`fixed right-5 top-5 z-[100] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
					toast.type === "success" ? "bg-emerald-500" : "bg-red-500"
				}`}>
					{toast.type === "success" ? "✓" : "✕"} {toast.text}
				</div>
			)}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-lg font-bold text-slate-900">Fiyat Listesi</h1>
					<p className="mt-0.5 text-sm text-slate-500">Hasta kartındaki tedavi seçimleri bu sayfadaki aktif listeyi kullanır</p>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<label className="text-sm text-gray-600 font-medium">Kullanılacak Fiyat Listesini Seçin:</label>
					<select value={activeList} onChange={e => setActiveList(e.target.value as "standard" | "custom")} className="rounded-lg border px-3 py-2 text-sm">
						<option value="standard">TDB Tarifesi</option>
						<option value="custom">Özel Fiyat Listesi</option>
					</select>
					<span className={"rounded-full px-3 py-1 text-xs font-semibold " + (activeList === "custom" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700")}>
						{activeList === "custom" ? "Özel Liste Aktif" : "TDB Tarife Aktif"}
					</span>
					<button onClick={() => { void seedCatalog("standard"); }} disabled={seedLoading !== null} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60">
						{seedLoading === "standard" ? "Yükleniyor..." : "TDB 2026 tam listeyi yükle"}
					</button>
					<button onClick={() => { void seedCatalog("custom"); }} disabled={seedLoading !== null} className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-60">
						{seedLoading === "custom" ? "Ekleniyor..." : "Özel listeye geniş tedavi paketini ekle"}
					</button>
				</div>
			</div>
			<div className="rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-600">
				Aktif liste seçimi tarayıcıda saklanır. Hasta kartındaki muayene ve tedavi seçim alanları bu tercihe göre TDB ya da Özel Liste verisini gösterir.
			</div>

			{loading ? (
				<p className="text-center py-8 text-gray-400">Yükleniyor...</p>
			) : (
				<div className="flex gap-4 items-start">
					<PriceTable title="TDB Tarife Fiyatları" prices={standardPrices} isCustom={false} />
					<PriceTable title="Özel Fiyatlar" prices={customPrices} isCustom={true} favorites={favorites} toggleFav={toggleFav}
						onEdit={p => { setEditItem(p); setEditAmount(String(p.amount)); }}
						onDelete={deletePrice} onAdd={addCustom}
					/>
				</div>
			)}

			{editItem && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
						<h3 className="mb-3 font-bold">{editItem.treatment} - Düzenle</h3>
						<label className="text-sm text-gray-600">Yeni KDV Dahil Tutar (TL)</label>
						<input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
						<div className="mt-4 flex gap-2">
							<button onClick={saveEdit} className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-white">Kaydet</button>
							<button onClick={() => setEditItem(null)} className="flex-1 rounded-lg border py-2 text-sm">Vazgeç</button>
						</div>
					</div>
				</div>
			)}
		</section>
	);
}
