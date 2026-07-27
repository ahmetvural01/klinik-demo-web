"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

type Toast = { id: string; title?: string; message: string; duration?: number; type?: 'success' | 'error' | 'info' };

type ToastContextValue = {
  showToast: (t: Omit<Toast, 'id'>) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = React.useRef<Record<string, number>>({});

  const showToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = String(Date.now()) + Math.random().toString(36).slice(2, 8);
    const toast: Toast = { id, duration: 3000, ...t };
    setToasts((s) => [...s, toast]);
    if (toast.duration && toast.duration > 0) {
      timersRef.current[id] = window.setTimeout(() => {
        setToasts((s) => s.filter(x => x.id !== id));
        delete timersRef.current[id];
      }, toast.duration);
    }
  }, []);

  useEffect(() => {
    function onEvent(e: Event) {
      try {
        const d = (e as CustomEvent<Omit<Toast, "id">>).detail;
        if (!d) return;
        showToast({ title: d.title, message: d.message, type: d.type, duration: d.duration ?? 3000 });
      } catch {}
    }
    window.addEventListener('klinik-show-toast', onEvent as EventListener);
    return () => window.removeEventListener('klinik-show-toast', onEvent as EventListener);
  }, [showToast]);

  const remove = useCallback((id: string) => setToasts((s) => s.filter(t => t.id !== id)), []);

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer));
      timersRef.current = {};
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="fixed right-3 top-3 z-[200] flex w-[calc(100vw-1.5rem)] max-w-sm flex-col gap-2 sm:right-4 sm:top-4 sm:w-auto">
        {toasts.map((t) => {
          const bg = t.type === 'error' ? 'bg-red-50 border-red-200' : t.type === 'success' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200';
          const dot = t.type === 'error' ? 'bg-red-500' : t.type === 'success' ? 'bg-emerald-500' : 'bg-primary';
          return (
            <div key={t.id} className={`w-full animate-fade-in rounded-2xl border px-4 py-3 shadow-[0_18px_36px_rgba(15,23,42,0.12)] ${bg}`}>
              <div className="flex items-start justify-between gap-3">
                <span className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${dot}`} />
                <div className="flex-1">
                  {t.title && <div className="text-sm font-semibold text-slate-800">{t.title}</div>}
                  <div className="text-sm leading-5 text-slate-700">{t.message}</div>
                </div>
                <button aria-label="Kapat" onClick={() => remove(t.id)} className="ml-3 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
