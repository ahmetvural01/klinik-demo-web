import SharedPanelLoading from "@/components/ui/PanelLoading";

// Platform sayfaları sekmeyi adres satırından okur (useTabParam →
// useSearchParams). Bu yükleme sınırı onları Suspense içine alır; olmadan
// üretim derlemesi ön-render sırasında durur.
export default function SuperadminLoading() {
  return (
    <div className="py-6">
      <SharedPanelLoading />
    </div>
  );
}
