"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { FormErrorBanner, FormField } from "@/components/ui/FormField";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FinanceDoctorSelect } from "@/components/muhasebe/FinanceDoctorSelect";
import { showToastSafe } from "@/lib/toast-client";
import { turkeyDateKey, turkeyLocalDateTimeToUtc } from "@/lib/tz";
import {
  DOCTOR_PAYOUT_METHODS,
  KDV_OPTIONS,
  METHOD_LABELS,
  cleanNote,
  monthName,
  parseAmount,
  requiresPos,
  todayKey,
} from "@/components/muhasebe/muhasebe-utils";
import { ExpenseTypesModal, type ExpenseCategory } from "@/components/muhasebe/ExpenseTypesModal";

export type LedgerPayment = {
  id: string; createdAt: string; amount: number | string; method: string;
  description?: string | null; posId?: string | null;
  patient?: { id: string; fullName: string } | null;
  doctorId?: string | null;
  doctor?: { id: string; fullName: string } | null;
};
export type LedgerExpense = {
  id: string; tarih: string; category: string; categoryId?: string | null; description?: string | null;
  tutar: number | string; yontem?: string | null; faturaNo?: string | null; kdvOrani?: number | null;
  doctorId?: string | null; doctor?: { id: string; fullName: string } | null;
  periodYear?: number | null; periodMonth?: number | null;
  sourceType?: string | null;
};

export type EditTarget = { kind: "TAHSILAT"; payment: LedgerPayment } | { kind: "GIDER"; expense: LedgerExpense };

type PosDevice = { id: string; name: string; isActive: boolean };

type Props = {
  target: EditTarget | null;
  onClose: () => void;
  onSaved: (kind: "TAHSILAT" | "GIDER") => void;
};

type PaymentForm = { date: string; amount: string; method: string; posId: string; doctorId: string; note: string };
type ExpenseForm = { date: string; amount: string; method: string; categoryId: string; categoryText: string; kdv: string; faturaNo: string; note: string };

/**
 * Tahsilat / gider düzeltme penceresi. Yalnız DEĞİŞEN alanlar gönderilir:
 * önceden her kayıtta tutar+tarih+hekim de gönderildiği için hakedişi ödenmiş
 * bir aydaki tahsilatın yalnız açıklaması bile düzeltilemiyordu (sunucu dönem
 * kilidi bu alanlara bakar).
 */
export function EditEntryModal({ target, onClose, onSaved }: Props) {
  const open = Boolean(target);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({ date: "", amount: "", method: "NAKIT", posId: "", doctorId: "", note: "" });
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>({ date: "", amount: "", method: "NAKIT", categoryId: "", categoryText: "", kdv: "0", faturaNo: "", note: "" });
  const initialRef = useRef("");
  const [posDevices, setPosDevices] = useState<PosDevice[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [typesOpen, setTypesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"date" | "amount" | "pos" | "category" | "doctor", string>>>({});

  const loadCategories = async () => {
    const response = await fetch("/api/gider-kategorileri", { cache: "no-store" }).catch(() => null);
    const data = response?.ok ? await response.json().catch(() => []) : [];
    setCategories(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    if (!target) return;
    setSaving(false);
    setError("");
    setFieldErrors({});
    if (target.kind === "TAHSILAT") {
      const payment = target.payment;
      const next: PaymentForm = {
        date: turkeyDateKey(new Date(payment.createdAt)),
        amount: String(Number(payment.amount || 0)),
        method: payment.method || "NAKIT",
        posId: payment.posId || "",
        doctorId: payment.doctorId || "",
        note: cleanNote(payment.description),
      };
      setPaymentForm(next);
      initialRef.current = JSON.stringify(next);
      fetch("/api/pos-devices", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : []))
        .then((devices: PosDevice[]) => setPosDevices((Array.isArray(devices) ? devices : []).filter((device) => device.isActive || device.id === payment.posId)))
        .catch(() => setPosDevices([]));
    } else {
      const expense = target.expense;
      const next: ExpenseForm = {
        date: turkeyDateKey(new Date(expense.tarih)),
        amount: String(Number(expense.tutar || 0)),
        method: expense.yontem || "NAKIT",
        categoryId: expense.categoryId || "",
        categoryText: expense.category || "",
        kdv: String(expense.kdvOrani ?? 0),
        faturaNo: expense.faturaNo || "",
        note: cleanNote(expense.description),
      };
      setExpenseForm(next);
      initialRef.current = JSON.stringify(next);
      void loadCategories();
    }
  }, [target]);

  const isPayout = target?.kind === "GIDER" && Boolean(target.expense.doctorId);
  const dirty = open && JSON.stringify(target?.kind === "TAHSILAT" ? paymentForm : expenseForm) !== initialRef.current;

  const expenseOptions = useMemo(() => {
    const q = expenseForm.categoryText.trim().toLocaleLowerCase("tr");
    return categories
      .filter((item) => item.isActive && !item.isDoctorPayout && (!q || item.name.toLocaleLowerCase("tr").includes(q)))
      .slice(0, 40)
      .map((item) => ({ id: item.id, label: item.name }));
  }, [categories, expenseForm.categoryText]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!target || saving) return;
    const errors: typeof fieldErrors = {};
    const form = target.kind === "TAHSILAT" ? paymentForm : expenseForm;
    const value = parseAmount(form.amount);
    if (!Number.isFinite(value) || value <= 0) errors.amount = "Geçerli bir tutar yazın.";
    if (!form.date) errors.date = "Tarih seçin.";
    else if (form.date > todayKey()) errors.date = "İleri bir tarih seçilemez.";
    if (target.kind === "TAHSILAT") {
      if (requiresPos(paymentForm.method) && !paymentForm.posId) errors.pos = "Kart / mail order tahsilatında POS seçin.";
      if (!paymentForm.doctorId) errors.doctor = "Doktoru seçin.";
    } else if (!isPayout && !expenseForm.categoryText.trim()) {
      errors.category = "Gider türünü seçin veya yazın.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const initial = JSON.parse(initialRef.current || "{}");
    const body: Record<string, unknown> = {};
    let url = "";
    if (target.kind === "TAHSILAT") {
      url = `/api/payments/${target.payment.id}`;
      if (paymentForm.date !== initial.date) body.createdAt = turkeyLocalDateTimeToUtc(paymentForm.date, "12:00").toISOString();
      if (paymentForm.amount !== initial.amount) body.amount = value;
      if (paymentForm.method !== initial.method) body.method = paymentForm.method;
      if (paymentForm.method !== initial.method || paymentForm.posId !== initial.posId) body.posId = requiresPos(paymentForm.method) ? paymentForm.posId || null : null;
      if (paymentForm.doctorId !== initial.doctorId) body.doctorId = paymentForm.doctorId;
      if (paymentForm.note !== initial.note) body.description = paymentForm.note.trim() || null;
    } else {
      url = `/api/gider/${target.expense.id}`;
      if (expenseForm.date !== initial.date) body.tarih = expenseForm.date;
      if (expenseForm.amount !== initial.amount) body.tutar = value;
      if (expenseForm.method !== initial.method) body.yontem = expenseForm.method;
      if (expenseForm.note !== initial.note) body.description = expenseForm.note.trim() || null;
      if (!isPayout) {
        if (expenseForm.categoryText !== initial.categoryText || expenseForm.categoryId !== initial.categoryId) {
          const typed = expenseForm.categoryText.trim();
          const match = expenseForm.categoryId
            ? categories.find((item) => item.id === expenseForm.categoryId)
            : categories.find((item) => !item.isDoctorPayout && item.name.toLocaleLowerCase("tr") === typed.toLocaleLowerCase("tr"));
          body.categoryId = match?.id || null;
          body.category = match?.name || typed;
        }
        if (expenseForm.kdv !== initial.kdv) body.kdvOrani = Number(expenseForm.kdv);
        if (expenseForm.faturaNo !== initial.faturaNo) body.faturaNo = expenseForm.faturaNo.trim() || null;
      }
    }
    if (Object.keys(body).length === 0) { onClose(); return; }

    setSaving(true);
    setError("");
    try {
      const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
      if (!response) { setError("Bağlantı kurulamadı. Değişiklikleriniz korundu; tekrar deneyin."); return; }
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.message || data?.error || "Değişiklik kaydedilemedi.");
        return;
      }
      showToastSafe({ message: target.kind === "TAHSILAT" ? "Tahsilat güncellendi." : "Gider güncellendi.", type: "success", icon: "finance" });
      onSaved(target.kind);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const title = target?.kind === "TAHSILAT" ? "Tahsilatı düzenle" : isPayout ? "Hakediş ödemesini düzenle" : "Gideri düzenle";
  const description = target?.kind === "TAHSILAT"
    ? `${target.payment.patient?.fullName || "Hasta"} — değişiklikler kayıt geçmişine işlenir.`
    : target?.kind === "GIDER" && isPayout
      ? `${target.expense.doctor?.fullName || "Doktor"} · ${target.expense.periodYear && target.expense.periodMonth ? `${monthName(target.expense.periodYear, target.expense.periodMonth)} hakedişi` : "hakediş"} — ay ve doktor sonradan değiştirilemez.`
      : "Değişiklikler kayıt geçmişine işlenir.";

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        isDirty={dirty}
        title={title}
        description={description}
        size="lg"
        module="finance"
        footer={(
          <>
            <Button variant="secondary" onClick={onClose} disabled={saving}>Vazgeç</Button>
            <Button type="submit" form="muhasebe-edit-form" loading={saving}>Kaydet</Button>
          </>
        )}
      >
        <form id="muhasebe-edit-form" onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
          <FormErrorBanner message={error} />
          {target?.kind === "TAHSILAT" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Tutar (₺)" required htmlFor="edit-amount" error={fieldErrors.amount}>
                <Input id="edit-amount" inputMode="decimal" value={paymentForm.amount} onChange={(event) => setPaymentForm((form) => ({ ...form, amount: event.target.value }))} />
              </FormField>
              <FormField label="Ödeme yöntemi" htmlFor="edit-method">
                <Select id="edit-method" value={paymentForm.method} onChange={(event) => setPaymentForm((form) => ({ ...form, method: event.target.value, posId: "" }))}>
                  {Object.entries(METHOD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </Select>
              </FormField>
              {requiresPos(paymentForm.method) && (
                <FormField label="POS cihazı" required htmlFor="edit-pos" error={fieldErrors.pos}>
                  <Select id="edit-pos" value={paymentForm.posId} onChange={(event) => setPaymentForm((form) => ({ ...form, posId: event.target.value }))}>
                    <option value="">POS seçin</option>
                    {posDevices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
                  </Select>
                </FormField>
              )}
              <FormField label="Doktor" required htmlFor="edit-doctor" error={fieldErrors.doctor} hint="Tahsilat bu doktorun hakedişine sayılır.">
                <FinanceDoctorSelect id="edit-doctor" value={paymentForm.doctorId} onChange={(id) => setPaymentForm((form) => ({ ...form, doctorId: id }))} aria-label="Doktor" />
              </FormField>
              <FormField label="Tarih" required htmlFor="edit-date" error={fieldErrors.date}>
                <Input id="edit-date" type="date" max={todayKey()} value={paymentForm.date} onChange={(event) => setPaymentForm((form) => ({ ...form, date: event.target.value }))} />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="Açıklama" htmlFor="edit-note">
                  <Input id="edit-note" value={paymentForm.note} maxLength={500} onChange={(event) => setPaymentForm((form) => ({ ...form, note: event.target.value }))} />
                </FormField>
              </div>
            </div>
          )}

          {target?.kind === "GIDER" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {!isPayout && (
                <div className="sm:col-span-2">
                  <FormField label="Gider türü" required htmlFor="edit-category" error={fieldErrors.category}>
                    <SearchSelect
                      id="edit-category"
                      aria-label="Gider türü"
                      query={expenseForm.categoryText}
                      onQueryChange={(value) => setExpenseForm((form) => ({ ...form, categoryText: value, categoryId: "" }))}
                      options={expenseOptions}
                      onSelect={(option) => setExpenseForm((form) => ({ ...form, categoryText: option.label, categoryId: option.id }))}
                      emptyText="Listede yok — bu ad bu gidere yazılır"
                      className="ui-control"
                    />
                  </FormField>
                  <button type="button" onClick={() => setTypesOpen(true)} className="mt-1.5 text-xs font-semibold text-primary hover:underline">
                    Gider türlerini düzenle
                  </button>
                </div>
              )}
              <FormField label="Tutar (₺)" required htmlFor="edit-amount" error={fieldErrors.amount} hint={isPayout ? "Ayın kalan hakedişini aşamaz." : undefined}>
                <Input id="edit-amount" inputMode="decimal" value={expenseForm.amount} onChange={(event) => setExpenseForm((form) => ({ ...form, amount: event.target.value }))} />
              </FormField>
              <FormField label="Ödeme yöntemi" htmlFor="edit-expense-method">
                <Select id="edit-expense-method" value={expenseForm.method} onChange={(event) => setExpenseForm((form) => ({ ...form, method: event.target.value }))}>
                  {(isPayout ? [...DOCTOR_PAYOUT_METHODS] : Object.keys(METHOD_LABELS)).map((key) => <option key={key} value={key}>{METHOD_LABELS[key]}</option>)}
                </Select>
              </FormField>
              <FormField label="Tarih" required htmlFor="edit-date" error={fieldErrors.date}>
                <Input id="edit-date" type="date" max={todayKey()} value={expenseForm.date} onChange={(event) => setExpenseForm((form) => ({ ...form, date: event.target.value }))} />
              </FormField>
              {!isPayout && (
                <>
                  <FormField label="KDV" htmlFor="edit-kdv">
                    <Select id="edit-kdv" value={expenseForm.kdv} onChange={(event) => setExpenseForm((form) => ({ ...form, kdv: event.target.value }))}>
                      {KDV_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>
                  </FormField>
                  <FormField label="Fatura no" htmlFor="edit-fatura">
                    <Input id="edit-fatura" value={expenseForm.faturaNo} maxLength={100} onChange={(event) => setExpenseForm((form) => ({ ...form, faturaNo: event.target.value }))} />
                  </FormField>
                </>
              )}
              <div className={isPayout ? "" : "sm:col-span-2"}>
                <FormField label="Açıklama" htmlFor="edit-note">
                  <Input id="edit-note" value={expenseForm.note} maxLength={1000} onChange={(event) => setExpenseForm((form) => ({ ...form, note: event.target.value }))} />
                </FormField>
              </div>
            </div>
          )}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </Modal>
      <ExpenseTypesModal open={typesOpen} onClose={() => setTypesOpen(false)} categories={categories} onChanged={loadCategories} />
    </>
  );
}
