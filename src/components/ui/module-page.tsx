"use client";

import { useCallback, useEffect, useState } from "react";

type FieldConfig = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "datetime-local" | "textarea" | "checkbox" | "select";
  required?: boolean;
  defaultValue?: string | number | boolean;
  options?: Array<{ label: string; value: string }>;
};

type Props = {
  title: string;
  endpoint: string;
  description: string;
  createFields?: FieldConfig[];
  editFields?: FieldConfig[];
  submitMethod?: "POST" | "PUT";
  queryParam?: string | null;
  queryPlaceholder?: string;
  itemEndpointBase?: string;
  idKey?: string;
};

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "Evet" : "Hayir";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function sanitizeRecord(record: Record<string, unknown>) {
  const cloned: Record<string, unknown> = {};
  Object.entries(record).forEach(([key, value]) => {
    if (key.toLowerCase().includes("password")) return;
    cloned[key] = value;
  });
  return cloned;
}

export function ModulePage({
  title,
  endpoint,
  description,
  createFields,
  editFields,
  submitMethod = "POST",
  queryParam = "q",
  queryPlaceholder = "Ara",
  itemEndpointBase,
  idKey = "id"
}: Props) {
  const [data, setData] = useState<unknown>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    createFields?.forEach((field) => {
      initial[field.name] = field.defaultValue ?? (field.type === "checkbox" ? false : "");
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [updating, setUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const activeEditFields = editFields ?? createFields;

  const toPayload = (fields: FieldConfig[], values: Record<string, unknown>) => {
    const payload: Record<string, unknown> = {};
    fields.forEach((field) => {
      const rawValue = values[field.name];
      if (field.type === "number") {
        payload[field.name] = Number(rawValue || 0);
      } else if (field.type === "checkbox") {
        payload[field.name] = Boolean(rawValue);
      } else if (field.type === "date") {
        payload[field.name] = rawValue ? new Date(`${rawValue}T00:00:00.000Z`).toISOString() : undefined;
      } else if (field.type === "datetime-local") {
        payload[field.name] = rawValue ? new Date(String(rawValue)).toISOString() : undefined;
      } else {
        payload[field.name] = rawValue;
      }
    });
    return payload;
  };

  const listUrl = useCallback(() => {
    if (!queryParam) return endpoint;
    if (!query.trim()) return endpoint;
    const separator = endpoint.includes("?") ? "&" : "?";
    return `${endpoint}${separator}${queryParam}=${encodeURIComponent(query.trim())}`;
  }, [endpoint, query, queryParam]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(listUrl());
      if (!res.ok) {
        throw new Error(`${res.status} - Veri alÄ±namadÄ±`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async () => {
    if (!createFields || createFields.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const payload = toPayload(createFields, form);

      const response = await fetch(endpoint, {
        method: submitMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: "KayÄ±t baÅŸarÄ±sÄ±z" }));
        throw new Error(body.message ?? "KayÄ±t baÅŸarÄ±sÄ±z");
      }

      await load();

      const reset: Record<string, unknown> = {};
      createFields.forEach((field) => {
        reset[field.name] = field.defaultValue ?? (field.type === "checkbox" ? false : "");
      });
      setForm(reset);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "KayÄ±t hatasÄ±");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: Record<string, unknown>) => {
    if (!activeEditFields || !itemEndpointBase) return;
    const rowId = String(row[idKey] ?? "");
    if (!rowId) return;

    const initial: Record<string, unknown> = {};
    activeEditFields.forEach((field) => {
      const raw = row[field.name];
      if (field.type === "date") {
        initial[field.name] = raw ? String(raw).slice(0, 10) : "";
      } else if (field.type === "datetime-local") {
        initial[field.name] = raw ? new Date(String(raw)).toISOString().slice(0, 16) : "";
      } else {
        initial[field.name] = raw ?? (field.type === "checkbox" ? false : "");
      }
    });

    setEditingId(rowId);
    setEditForm(initial);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleUpdate = async () => {
    if (!editingId || !activeEditFields || !itemEndpointBase) return;

    setUpdating(true);
    setError(null);
    try {
      const payload = toPayload(activeEditFields, editForm);
      const response = await fetch(`${itemEndpointBase}/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: "GÃ¼ncelleme baÅŸarÄ±sÄ±z" }));
        throw new Error(body.message ?? "GÃ¼ncelleme baÅŸarÄ±sÄ±z");
      }

      cancelEdit();
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "GÃ¼ncelleme hatasÄ±");
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (row: Record<string, unknown>) => {
    if (!itemEndpointBase) return;
    const rowId = String(row[idKey] ?? "");
    if (!rowId) return;

    const okay = window.confirm("Bu kaydi silmek istediginize emin misiniz?");
    if (!okay) return;

    setDeletingId(rowId);
    setError(null);
    try {
      const response = await fetch(`${itemEndpointBase}/${rowId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: "Silme baÅŸarÄ±sÄ±z" }));
        throw new Error(body.message ?? "Silme baÅŸarÄ±sÄ±z");
      }

      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Silme hatasi");
    } finally {
      setDeletingId(null);
    }
  };

  const renderData = () => {
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return <p className="text-sm text-gray-500">KayÄ±t bulunamadÄ±.</p>;
      }

      const rows: Array<Record<string, unknown>> = data
        .map((item) => (typeof item === "object" && item !== null ? sanitizeRecord(item as Record<string, unknown>) : { value: item }))
        .slice(0, 500);

      const columns = Object.keys(rows[0]).slice(0, 8);
      const canEditDelete = Boolean(itemEndpointBase && activeEditFields && activeEditFields.length > 0);

      return (
        <div className="overflow-auto rounded-lg border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-100 text-xs uppercase text-gray-600">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="px-3 py-2 font-semibold">{column}</th>
                ))}
                {canEditDelete && <th className="px-3 py-2 font-semibold">Ä°ÅŸlem</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-t align-top">
                  {columns.map((column) => (
                    <td key={column} className="px-3 py-2 text-xs">{formatValue(row[column])}</td>
                  ))}
                  {canEditDelete && (
                    <td className="px-3 py-2 text-xs">
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(row)} className="rounded bg-primary px-2 py-1 text-white">Duzenle</button>
                        <button
                          onClick={() => handleDelete(row)}
                          disabled={deletingId === String(row[idKey] ?? "")}
                          className="rounded bg-danger px-2 py-1 text-white disabled:opacity-50"
                        >
                          Sil
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (typeof data === "object" && data !== null) {
      const objectData = sanitizeRecord(data as Record<string, unknown>);
      const numericEntries = Object.entries(objectData).filter(([, value]) => typeof value === "number");
      const scalarEntries = Object.entries(objectData).filter(([, value]) => !Array.isArray(value) && typeof value !== "object");
      const arrayEntries = Object.entries(objectData).filter(([, value]) => Array.isArray(value));

      return (
        <div className="space-y-4">
          {numericEntries.length > 0 && (
            <div className="grid gap-3 md:grid-cols-4">
              {numericEntries.map(([key, value]) => (
                <div key={key} className="rounded-lg border bg-white p-3">
                  <p className="text-xs uppercase text-gray-500">{key}</p>
                  <p className="text-2xl font-bold text-primary">{String(value)}</p>
                </div>
              ))}
            </div>
          )}

          {scalarEntries.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2">
              {scalarEntries.map(([key, value]) => (
                <div key={key} className="rounded-lg border bg-white px-3 py-2 text-sm">
                  <span className="text-xs uppercase text-gray-500">{key}</span>
                  <p className="font-semibold text-gray-800">{formatValue(value)}</p>
                </div>
              ))}
            </div>
          )}

          {arrayEntries.map(([section, entries]) => {
            const arrayRows: Array<Record<string, unknown>> = (entries as unknown[])
              .map((item) => (typeof item === "object" && item !== null ? sanitizeRecord(item as Record<string, unknown>) : { value: item }))
              .slice(0, 100);

            if (arrayRows.length === 0) {
              return null;
            }

            const columns = Object.keys(arrayRows[0]).slice(0, 6);
            const canEditDelete = Boolean(itemEndpointBase && activeEditFields && activeEditFields.length > 0);

            return (
              <div key={section} className="rounded-lg border">
                <p className="border-b bg-gray-100 px-3 py-2 text-xs font-semibold uppercase text-gray-600">{section}</p>
                <div className="overflow-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead>
                      <tr className="bg-white text-gray-600">
                        {columns.map((column) => (
                          <th key={column} className="px-3 py-2">{column}</th>
                        ))}
                        {canEditDelete && <th className="px-3 py-2">Ä°ÅŸlem</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {arrayRows.map((row, index) => (
                        <tr key={index} className="border-t">
                          {columns.map((column) => (
                            <td key={column} className="px-3 py-2">{formatValue(row[column])}</td>
                          ))}
                          {canEditDelete && (
                            <td className="px-3 py-2">
                              <div className="flex gap-2">
                                <button onClick={() => startEdit(row)} className="rounded bg-primary px-2 py-1 text-white">Duzenle</button>
                                <button
                                  onClick={() => handleDelete(row)}
                                  disabled={deletingId === String(row[idKey] ?? "")}
                                  className="rounded bg-danger px-2 py-1 text-white disabled:opacity-50"
                                >
                                  Sil
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {scalarEntries.length === 0 && arrayEntries.length === 0 && (
            <pre className="max-h-[45vh] overflow-auto rounded-lg bg-gray-900 p-4 text-xs text-green-300">
              {JSON.stringify(objectData, null, 2)}
            </pre>
          )}
        </div>
      );
    }

    return <p className="text-sm text-gray-500">Veri bulunamadı.</p>;
  };

  return (
    <section className="rounded-xl bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-primary">{title}</h2>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {queryParam && (
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={queryPlaceholder}
              className="rounded-lg border px-3 py-2 text-sm"
            />
          )}
          <button onClick={load} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
            Yenile
          </button>
        </div>
      </div>

      {createFields && createFields.length > 0 && (
        <div className="mb-4 rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Yeni Kayıt</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {createFields.map((field) => {
              if (field.type === "textarea") {
                return (
                  <label key={field.name} className="md:col-span-2">
                    <span className="mb-1 block text-xs text-gray-600">{field.label}</span>
                    <textarea
                      value={String(form[field.name] ?? "")}
                      onChange={(event) => setForm((prev) => ({ ...prev, [field.name]: event.target.value }))}
                      className="h-24 w-full rounded-lg border px-3 py-2 text-sm"
                      required={field.required}
                    />
                  </label>
                );
              }

              if (field.type === "select") {
                return (
                  <label key={field.name}>
                    <span className="mb-1 block text-xs text-gray-600">{field.label}</span>
                    <select
                      value={String(form[field.name] ?? "")}
                      onChange={(event) => setForm((prev) => ({ ...prev, [field.name]: event.target.value }))}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      required={field.required}
                    >
                      <option value="">Seçiniz</option>
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                );
              }

              if (field.type === "checkbox") {
                return (
                  <label key={field.name} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(form[field.name])}
                      onChange={(event) => setForm((prev) => ({ ...prev, [field.name]: event.target.checked }))}
                    />
                    {field.label}
                  </label>
                );
              }

              return (
                <label key={field.name}>
                  <span className="mb-1 block text-xs text-gray-600">{field.label}</span>
                  <input
                    type={field.type ?? "text"}
                    value={String(form[field.name] ?? "")}
                    onChange={(event) => setForm((prev) => ({ ...prev, [field.name]: event.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    required={field.required}
                  />
                </label>
              );
            })}
          </div>
          <div className="mt-3">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>
      )}

      {editingId && activeEditFields && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">KayÄ±t DÃ¼zenle</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {activeEditFields.map((field) => {
              if (field.type === "textarea") {
                return (
                  <label key={field.name} className="md:col-span-2">
                    <span className="mb-1 block text-xs text-gray-600">{field.label}</span>
                    <textarea
                      value={String(editForm[field.name] ?? "")}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, [field.name]: event.target.value }))}
                      className="h-24 w-full rounded-lg border px-3 py-2 text-sm"
                      required={field.required}
                    />
                  </label>
                );
              }

              if (field.type === "select") {
                return (
                  <label key={field.name}>
                    <span className="mb-1 block text-xs text-gray-600">{field.label}</span>
                    <select
                      value={String(editForm[field.name] ?? "")}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, [field.name]: event.target.value }))}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      required={field.required}
                    >
                      <option value="">Seçiniz</option>
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                );
              }

              if (field.type === "checkbox") {
                return (
                  <label key={field.name} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(editForm[field.name])}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, [field.name]: event.target.checked }))}
                    />
                    {field.label}
                  </label>
                );
              }

              return (
                <label key={field.name}>
                  <span className="mb-1 block text-xs text-gray-600">{field.label}</span>
                  <input
                    type={field.type ?? "text"}
                    value={String(editForm[field.name] ?? "")}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, [field.name]: event.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    required={field.required}
                  />
                </label>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleUpdate}
              disabled={updating}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {updating ? "Güncelleniyor..." : "Güncelle"}
            </button>
            <button onClick={cancelEdit} className="rounded-lg bg-gray-500 px-3 py-2 text-sm font-semibold text-white">
              Vazgec
            </button>
          </div>
        </div>
      )}

      {loading && <p>Yukleniyor...</p>}
      {error && <p className="text-danger">{error}</p>}
      {!loading && !error && renderData()}
    </section>
  );
}

