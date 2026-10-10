"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirmDialog } from "@/lib/confirm-client";
import { showToastSafe } from "@/lib/toast-client";
import { cachedGet, invalidateCachedGet } from "@/lib/client-cache";
import { FirmaPaymentModal, type FirmaPaymentTarget } from "@/components/firma/FirmaPaymentModal";
import { PurchaseFormModal, type PurchaseFormSaved } from "@/components/firma/PurchaseFormModal";
import { PurchaseDetailModal } from "@/components/firma/PurchaseDetailModal";
import { PurchaseReceiveModal } from "@/components/firma/PurchaseReceiveModal";
import {
  friendlyPurchaseError,
  type Purchase,
  type PurchaseFirmaOption,
  type PurchasePrefill,
  type StockItem,
} from "@/components/firma/purchase-model";

/** Satın alma formundaki ürün önerileri için hafif liste (lotsuz, ortalamasız). */
const STOCK_SUGGEST_URL = "/api/stock?lite=1";
/** Aktif firmalar (satın almada laboratuvarlar listelenmez). */
const FIRMA_LIST_URL = "/api/firma";
const LIST_TTL_MS = 60_000;

type FormState = {
  open: boolean;
  mode: "create" | "edit";
  purchase: Purchase | null;
  prefill: PurchasePrefill | null;
  initialFirmaId?: string;
};

type DetailState = {
  open: boolean;
  id: string;
  purchase: Purchase | null;
  loading: boolean;
  error: string | null;
  actionError: string | null;
  cancelling: boolean;
};

type UsePurchaseModalsOptions = {
  /**
   * Sayfada stok listesi zaten varsa (Stok) verilir; verilmezse ürün
   * önerileri form AÇILINCA hafif uçtan yüklenir (Satın alma ve tedarikçi
   * sayfaları ekranda göstermedikleri stoğu açılışta çekmesin).
   */
  stockItems?: StockItem[];
  /** Seçilebilecek firmalar; verilmezse form açılınca aktif firmalar yüklenir. */
  firmas?: PurchaseFirmaOption[];
  /** Sayfa firma listesini yenilesin (formdan yeni tedarikçi eklendi). */
  onFirmasChanged?: () => void;
  onChanged: (firmaId: string) => void | Promise<void>;
  /** Firma sayfasından açılınca firma kilitli. */
  currentFirmaId?: string;
  canWrite?: boolean;
};

const CLOSED_FORM: FormState = { open: false, mode: "create", purchase: null, prefill: null };
const CLOSED_DETAIL: DetailState = { open: false, id: "", purchase: null, loading: false, error: null, actionError: null, cancelling: false };

async function fetchPurchase(id: string): Promise<Purchase> {
  const response = await fetch(`/api/purchases/${id}`, { cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Satın alma yüklenemedi.");
  return data as Purchase;
}

/**
 * Satın alma pencereleri (yeni/düzenle formu, ayrıntı, teslim al, ödeme) ve
 * API çağrıları — Satın alma listesi, tedarikçi sayfası ve Stok ("Sipariş
 * ver") aynı yerden kullanır. Ödeme ortak "Ödeme yap" penceresiyle yapılır.
 */
export function usePurchaseModals({
  stockItems, firmas, onFirmasChanged, onChanged, currentFirmaId, canWrite = true,
}: UsePurchaseModalsOptions) {
  const [form, setForm] = useState<FormState>(CLOSED_FORM);
  const [detail, setDetail] = useState<DetailState>(CLOSED_DETAIL);
  const [receiving, setReceiving] = useState<Purchase | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<{ firma: FirmaPaymentTarget; suggestedAmount?: number; reference?: string; purchaseId?: string } | null>(null);
  const detailIdRef = useRef("");

  // ── Tembel listeler ────────────────────────────────────────────────────
  const [lazyStock, setLazyStock] = useState<StockItem[] | null>(null);
  const [lazyStockLoading, setLazyStockLoading] = useState(false);
  const [lazyFirmas, setLazyFirmas] = useState<PurchaseFirmaOption[] | null>(null);
  const [lazyFirmasLoading, setLazyFirmasLoading] = useState(false);
  const [lazyFirmasError, setLazyFirmasError] = useState<string | null>(null);
  const [createdFirmas, setCreatedFirmas] = useState<PurchaseFirmaOption[]>([]);

  const ensureStock = useCallback(async () => {
    if (stockItems) return;
    setLazyStockLoading(true);
    try {
      const rows = await cachedGet<StockItem[]>(STOCK_SUGGEST_URL, LIST_TTL_MS, { throwOnError: true });
      setLazyStock(Array.isArray(rows) ? rows : []);
    } catch {
      // Öneri listesi yüklenemezse ürün yine adıyla yazılabilir (aynı adlı karta sunucu bağlar).
      setLazyStock((current) => current || []);
    } finally {
      setLazyStockLoading(false);
    }
  }, [stockItems]);

  const ensureFirmas = useCallback(async () => {
    if (firmas) return;
    setLazyFirmasLoading(true);
    setLazyFirmasError(null);
    try {
      const rows = await cachedGet<Array<{ id: string; name: string; bakiye?: number; kategori?: string }>>(FIRMA_LIST_URL, LIST_TTL_MS, { throwOnError: true });
      setLazyFirmas((Array.isArray(rows) ? rows : [])
        .filter((firma) => firma.kategori !== "LAB")
        .map((firma) => ({ id: firma.id, name: firma.name, bakiye: firma.bakiye })));
    } catch (error) {
      setLazyFirmasError(error instanceof Error ? error.message : "Tedarikçi listesi yüklenemedi.");
    } finally {
      setLazyFirmasLoading(false);
    }
  }, [firmas]);

  const firmaOptions = useMemo(() => {
    const base = firmas || lazyFirmas || [];
    const extra = createdFirmas.filter((created) => !base.some((firma) => firma.id === created.id));
    return [...base, ...extra];
  }, [firmas, lazyFirmas, createdFirmas]);

  // ── Yeni / düzenle ─────────────────────────────────────────────────────
  const openAddPurchase = useCallback((firmaId?: string, prefill?: PurchasePrefill) => {
    if (!canWrite) return;
    void ensureStock();
    void ensureFirmas();
    setForm({ open: true, mode: "create", purchase: null, prefill: prefill || null, initialFirmaId: firmaId || currentFirmaId });
  }, [canWrite, currentFirmaId, ensureFirmas, ensureStock]);

  const openPurchaseEdit = useCallback(async (purchaseId: string) => {
    if (!canWrite) return;
    void ensureStock();
    try {
      const purchase = await fetchPurchase(purchaseId);
      setForm({ open: true, mode: "edit", purchase, prefill: null });
    } catch (error) {
      showToastSafe({ title: "Satın alma açılamadı", message: error instanceof Error ? error.message : "Bağlantı kurulamadı.", type: "error" });
    }
  }, [canWrite, ensureStock]);

  /** Ayrıntıda yüklü kayıt (kalemler ve "kullanıldı" bilgisiyle) düzenlemeye doğrudan geçer; ikinci istek atılmaz. */
  const openPurchaseEditWith = useCallback((purchase: Purchase) => {
    if (!canWrite) return;
    void ensureStock();
    setForm({ open: true, mode: "edit", purchase, prefill: null });
  }, [canWrite, ensureStock]);

  const closeForm = useCallback(() => setForm((current) => ({ ...current, open: false })), []);

  // ── Ayrıntı ────────────────────────────────────────────────────────────
  const loadPurchaseDetail = useCallback(async (purchaseId: string) => {
    detailIdRef.current = purchaseId;
    setDetail((current) => ({ ...current, id: purchaseId, loading: true, error: null }));
    try {
      const purchase = await fetchPurchase(purchaseId);
      if (detailIdRef.current === purchaseId) setDetail((current) => ({ ...current, purchase, loading: false }));
    } catch (error) {
      if (detailIdRef.current === purchaseId) setDetail((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Bağlantı kurulamadı." }));
    }
  }, []);

  const openPurchaseDetail = useCallback(async (purchaseId: string) => {
    setDetail({ ...CLOSED_DETAIL, open: true, id: purchaseId, loading: true });
    await loadPurchaseDetail(purchaseId);
  }, [loadPurchaseDetail]);

  /** Ayrıntı penceresi açıksa (açıkken kimliği detailIdRef içinde durur) yeniden okunur. */
  const refreshDetailIfOpen = useCallback(async (purchaseId?: string) => {
    const openId = detailIdRef.current;
    if (!openId || (purchaseId && purchaseId !== openId)) return;
    await loadPurchaseDetail(openId);
  }, [loadPurchaseDetail]);

  // ── Teslim alma ────────────────────────────────────────────────────────
  const openReceivePurchase = useCallback(async (purchaseOrId: Purchase | string) => {
    if (!canWrite) return;
    let purchase: Purchase | null = typeof purchaseOrId === "string" ? null : purchaseOrId;
    if (!purchase || !purchase.items) {
      try {
        purchase = await fetchPurchase(typeof purchaseOrId === "string" ? purchaseOrId : purchaseOrId.id);
      } catch (error) {
        showToastSafe({ title: "Sipariş açılamadı", message: error instanceof Error ? error.message : "Bağlantı kurulamadı.", type: "error" });
        return;
      }
    }
    setReceiving(purchase);
  }, [canWrite]);

  // ── İptal ──────────────────────────────────────────────────────────────
  const cancelPurchase = useCallback(async (purchase: Purchase) => {
    if (!canWrite) return;
    const isOrder = purchase.receiptStatus === "SIPARIS_VERILDI";
    const consumed = (purchase.items || []).filter((item) => item.consumed);
    if (!isOrder && consumed.length > 0) {
      // Sunucu zaten reddeder; neden ve yapılacak iş önceden, pencerede söylenir.
      setDetail((current) => ({
        ...current,
        actionError: `${consumed.map((item) => item.productName).join(", ")} kullanıldığı için bu satın alma iptal edilemez. Kullanılmayan ürünleri firmaya iade ettiyseniz “Diğer → Düzenle” ile o satırları silin ya da miktarını azaltın.`,
      }));
      return;
    }
    const confirmed = await confirmDialog({
      title: isOrder ? "Sipariş iptal edilsin mi?" : "Satın alma iptal edilsin mi?",
      message: isOrder
        ? "Sipariş kapanır. Stok ve firma borcu zaten oluşmamıştı."
        : "Stoğa giren ürünler stoktan düşülür, firma borcu silinir. Bu satın almayla birlikte girilen ödeme varsa o da iptal edilir.",
      danger: true,
      confirmText: isOrder ? "Siparişi iptal et" : "Satın almayı iptal et",
      cancelText: "Vazgeç",
    });
    if (!confirmed) return;
    setDetail((current) => ({ ...current, cancelling: true, actionError: null }));
    try {
      const response = await fetch(`/api/purchases/${purchase.id}/cancel`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(friendlyPurchaseError(data.error, "Satın alma iptal edilemedi. Tekrar deneyin."));
      showToastSafe({ title: "İptal edildi", message: data.message || "Satın alma iptal edildi.", type: "success" });
      setDetail(CLOSED_DETAIL);
      detailIdRef.current = "";
      invalidateCachedGet(STOCK_SUGGEST_URL);
      await onChanged(purchase.firmaId);
    } catch (error) {
      setDetail((current) => ({ ...current, cancelling: false, actionError: error instanceof Error ? error.message : "Bağlantı kurulamadı." }));
    }
  }, [canWrite, onChanged]);

  // ── Ödeme ──────────────────────────────────────────────────────────────
  /** Firma için ödeme penceresi (firma bakiyesi sunucudan okunur). */
  const openFirmaPayment = useCallback(async (firmaId: string, options?: { suggestedAmount?: number; reference?: string; purchaseId?: string }) => {
    if (!canWrite) return;
    try {
      const response = await fetch(`/api/firma/${firmaId}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Firma bilgisi yüklenemedi.");
      if (Number(data.bakiye || 0) <= 0) {
        showToastSafe({ title: "Açık borç yok", message: `${data.name} için ödenecek kalan borç görünmüyor.`, type: "info" });
        return;
      }
      setPaymentTarget({ firma: { id: data.id, name: data.name, bakiye: Number(data.bakiye || 0) }, ...options });
    } catch (error) {
      showToastSafe({ title: "Ödeme açılamadı", message: error instanceof Error ? error.message : "Bağlantı kurulamadı.", type: "error" });
    }
  }, [canWrite]);

  // Şube değişimi vb. ile pencereler açıkken sayfa yetkisi düşerse kapat.
  useEffect(() => {
    if (canWrite) return;
    setForm(CLOSED_FORM);
    setReceiving(null);
  }, [canWrite]);

  const handleFormSaved = useCallback(async (result: PurchaseFormSaved) => {
    invalidateCachedGet(STOCK_SUGGEST_URL);
    await onChanged(result.firmaId || currentFirmaId || "");
    await refreshDetailIfOpen(result.purchaseId);
  }, [currentFirmaId, onChanged, refreshDetailIfOpen]);

  const modals = (
    <>
      <PurchaseFormModal
        open={form.open}
        mode={form.mode}
        purchase={form.purchase}
        prefill={form.prefill}
        initialFirmaId={form.initialFirmaId}
        lockFirma={Boolean(currentFirmaId)}
        firmas={firmaOptions}
        firmasLoading={!firmas && lazyFirmasLoading}
        firmasError={firmas ? null : lazyFirmasError}
        canCreateFirma={canWrite && !currentFirmaId}
        onFirmaCreated={(created) => {
          setCreatedFirmas((current) => [...current, created]);
          invalidateCachedGet(FIRMA_LIST_URL);
          onFirmasChanged?.();
        }}
        stockItems={stockItems || lazyStock || []}
        stockLoading={!stockItems && lazyStockLoading}
        onClose={closeForm}
        onSaved={handleFormSaved}
      />

      <PurchaseDetailModal
        open={detail.open}
        purchase={detail.purchase}
        loading={detail.loading}
        error={detail.error}
        actionError={detail.actionError}
        cancelling={detail.cancelling}
        canWrite={canWrite}
        onRetry={() => void loadPurchaseDetail(detail.id)}
        onClose={() => { setDetail(CLOSED_DETAIL); detailIdRef.current = ""; }}
        onEdit={(purchase) => { setDetail(CLOSED_DETAIL); detailIdRef.current = ""; openPurchaseEditWith(purchase); }}
        onReceive={(purchase) => void openReceivePurchase(purchase)}
        onPay={(purchase) => void openFirmaPayment(purchase.firmaId, {
          suggestedAmount: purchase.paymentSummary?.remaining,
          reference: purchase.faturaNo ? `Fatura ${purchase.faturaNo} ödemesi` : "Satın alma ödemesi",
          purchaseId: purchase.id,
        })}
        onCancel={(purchase) => void cancelPurchase(purchase)}
      />

      <PurchaseReceiveModal
        open={Boolean(receiving)}
        purchase={receiving}
        onClose={() => setReceiving(null)}
        onEditOrder={(purchase) => { setReceiving(null); openPurchaseEditWith(purchase); }}
        onSaved={async (purchase) => {
          invalidateCachedGet(STOCK_SUGGEST_URL);
          await onChanged(purchase.firmaId);
          await refreshDetailIfOpen(purchase.id);
        }}
      />

      <FirmaPaymentModal
        open={Boolean(paymentTarget)}
        firma={paymentTarget?.firma || null}
        suggestedAmount={paymentTarget?.suggestedAmount}
        reference={paymentTarget?.reference}
        // Faturadan açılan ödeme önce o faturanın borcuna düşer (sunucu purchaseId'yi
        // tercih eder); önceden en eski borca düşüyor, fatura "Ödenmedi" kalıyordu.
        purchaseId={paymentTarget?.purchaseId}
        onClose={() => setPaymentTarget(null)}
        onSaved={async () => {
          const target = paymentTarget;
          await onChanged(target?.firma.id || "");
          if (target?.purchaseId) await refreshDetailIfOpen(target.purchaseId);
        }}
      />
    </>
  );

  return { openAddPurchase, openPurchaseDetail, openPurchaseEdit, openReceivePurchase, openFirmaPayment, cancelPurchase, modals };
}
