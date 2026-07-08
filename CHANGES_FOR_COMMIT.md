Özet
-----
Bu değişiklikler panel için global toast bildirim sistemini ekler ve bazı panellerde (giriş, hasta-takip) başarı/error bildirimlerini toast ile gösterir.

Eklenen dosyalar
- `src/components/ui/ToastProvider.tsx` — Toast context + UI (success/error/info, auto-hide, manual close, CustomEvent dinleyici)
- `src/components/ui/ToastWrapper.tsx` — client wrapper
- `src/components/ui/ToastProvider.tsx` — (güncellendi) türler, ikon, animasyon
- `src/components/auth/login-form.tsx` — demo ve giriş sonrası toast çağrıları eklendi
- `src/app/(panel)/layout.tsx` — panel layout toast wrapper ile sarıldı
- `src/app/(panel)/hasta-takip/page.tsx` — başarı mesajlarında toast gösterimi
- `src/app/globals.css` — basit fade-in animasyonu eklendi

Commit yapmak için (yerel makinede):
1) Değişiklikleri gözden geçir
2) Aşağıdaki komutları çalıştır

```powershell
git checkout -b feature/toasts
git add -A
git commit -m "feat: add global toast notifications (variants, animation) and integrate across panels"
git push -u origin feature/toasts
```

PR oluşturma
- Git sağlayıcınız (GitHub/GitLab) üzerinden `feature/toasts` branch'inden `dev`/`main` hedefli bir Pull Request oluşturun.

Notlar
- Bu çalışma ortamında `git` bulunmadığı için otomatik commit/push gerçekleştirilemedi. Yukarıdaki adımları yerel makinenizde çalıştırmanız yeterlidir.
