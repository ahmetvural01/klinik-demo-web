import { ShieldOff } from "lucide-react";

export default function YetkiYokPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500">
        <ShieldOff className="h-8 w-8" />
      </span>
      <h2 className="mb-2 text-2xl font-black text-slate-900">Erişim Yetersiz</h2>
      <p className="max-w-sm text-sm text-slate-500">
        Bu modüle erişim yetkiniz bulunmuyor. Yetki almak için sistem yöneticisiyle iletişime geçin.
      </p>
    </div>
  );
}
