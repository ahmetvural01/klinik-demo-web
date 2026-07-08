import { NextResponse } from "next/server";
import { exec } from "child_process";
import { requireAuth } from "@/lib/api";

export async function POST(req: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Bu işlem üretim ortamında kapalıdır.' }, { status: 403 });
  }

  const auth = await requireAuth("superadmin");
  if (auth.error) {
    return auth.error;
  }

  const host = req.headers.get('host') || '';
  if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
    return NextResponse.json({ error: 'Bu işlem yalnızca yerel geliştirme ortamında çalışır.' }, { status: 403 });
  }

  return await new Promise<NextResponse>((resolve) => {
    const child = exec('npm run prisma:seed', { cwd: process.cwd(), env: process.env }, (err, stdout, stderr) => {
      if (err) {
        const message = (stderr || err.message || '').toString();
        // If seed already applied (unique constraint), treat as success
        if (message.includes('P2002') || message.toLowerCase().includes('unique constraint failed')) {
          resolve(NextResponse.json({ ok: true, message: 'Demo verisi zaten mevcut, tekrar yükleme atlandı.', output: stdout }));
          return;
        }
        if (message.toLowerCase().includes('can\'t reach database server') || message.toLowerCase().includes('prismaclientinitializationerror')) {
          resolve(NextResponse.json({ ok: false, message: 'Veritabanına erişilemiyor. Lütfen veritabanı bağlantısını kontrol edin.', output: stdout || message }, { status: 503 }));
          return;
        }
        resolve(NextResponse.json({ ok: false, error: 'Demo verisi yüklenemedi.', detail: stderr || err.message }, { status: 500 }));
        return;
      }
      resolve(NextResponse.json({ ok: true, output: stdout }));
    });

    // safety: kill after 2 minutes
    setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {};
    }, 2 * 60 * 1000);
  });
}
