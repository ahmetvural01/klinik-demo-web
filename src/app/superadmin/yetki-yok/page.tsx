export default function YetkiYokPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <span className="text-6xl mb-4">🚫</span>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Erişim Yetersiz</h2>
      <p className="text-gray-500 max-w-sm">
        Bu modüle erişim yetkiniz bulunmuyor. Yetki almak için sistem yöneticisiyle iletişime geçin.
      </p>
    </div>
  );
}
