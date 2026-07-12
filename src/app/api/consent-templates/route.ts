import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export const dynamic = "force-dynamic";

const COMPREHENSIVE_TITLE = "Kapsamlı Klinik Onam ve KVKK Paketi";
const COMPREHENSIVE_CATEGORY = "KAPSAMLI_ONAM";
const COMPREHENSIVE_BODY = `## 1. Hasta Bilgilendirme ve Genel Kabul
Hasta, klinikte uygulanabilecek muayene, teşhis, görüntüleme, tedavi planlama, koruyucu uygulama, restoratif işlem, endodontik işlem, periodontal işlem, cerrahi işlem, implant tedavisi, protez tedavisi, ortodontik değerlendirme, laboratuvar süreci, reçete düzenleme, kontrol randevusu ve takip işlemleri hakkında genel olarak bilgilendirildiğini beyan eder.

Hasta, hekimin ağız ve diş sağlığı muayenesi sonucunda tedavi planının klinik bulgulara, radyografik görüntülere, sistemik sağlık durumuna, ağız hijyenine, tedaviye uyuma ve zaman içinde değişebilen klinik koşullara göre güncellenebileceğini kabul eder. Tedavi sırasında beklenmeyen bulgularla karşılaşılması halinde hekim tarafından ek açıklama yapılabileceği ve tedavi planında değişiklik gerekebileceği hastaya anlatılmıştır.

Hasta, mevcut hastalıklarını, kullandığı ilaçları, alerjilerini, hamilelik veya hamilelik şüphesini, kanama bozukluğu gibi özel durumlarını, daha önce geçirdiği operasyonları ve sağlık geçmişine ilişkin bilgileri doğru ve eksiksiz olarak bildirmekle yükümlü olduğunu kabul eder.

## 2. KVKK Aydınlatma Metni
Hasta, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında kimlik, iletişim, sağlık, muayene, teşhis, tedavi, randevu, ödeme, fatura, radyolojik görüntüleme, ağız içi fotoğraf, laboratuvar, reçete, hasta takip ve klinik operasyon kayıtlarının sağlık hizmetinin yürütülmesi amacıyla işlenebileceği konusunda bilgilendirilmiştir.

Bu veriler; sağlık hizmetinin planlanması ve yürütülmesi, hasta dosyasının oluşturulması, randevu ve hatırlatma süreçleri, tedavi planı hazırlanması, reçete düzenlenmesi, laboratuvar ve tedarik süreçlerinin yürütülmesi, finansal kayıtların tutulması, yasal saklama yükümlülükleri, denetim ve uyuşmazlık süreçleri, yetkili kamu kurumlarına bildirim yapılması ve hizmet kalitesinin artırılması amaçlarıyla işlenebilir.

Hasta, kişisel verilerine erişme, düzeltme, silme, işlenmesine itiraz etme ve ilgili mevzuat kapsamındaki diğer hakları hakkında bilgilendirildiğini; bu haklarını kullanmak için klinik yönetimine başvurabileceğini kabul eder.

## 3. Açık Rıza ve İletişim Onayı
Hasta, sağlık hizmetinin gerektirdiği ölçüde kişisel ve özel nitelikli kişisel verilerinin klinik tarafından işlenmesine, saklanmasına, hasta dosyasında tutulmasına ve yetkili sağlık personeli tarafından erişilmesine açık rıza verdiğini beyan eder.

Hasta, randevu hatırlatma, tedavi bilgilendirme, kontrol çağrısı, laboratuvar/protez süreç bilgilendirmesi, ödeme hatırlatma ve hizmet iletişimi için telefon, SMS, e-posta veya dijital iletişim kanallarıyla kendisiyle iletişime geçilebileceğini kabul eder.

Hasta, açık rızasını dilediği zaman geri çekebileceği; ancak geri çekme tarihinden önce hukuka uygun şekilde yapılmış işlemlerin geçerliliğini koruyacağı konusunda bilgilendirilmiştir.

## 4. Radyografi, Fotoğraf ve Görüntüleme Onamı
Hasta, tanı ve tedavi planlaması için periapikal film, panoramik film, sefalometrik film, dental tomografi, ağız içi fotoğraf, yüz fotoğrafı veya benzeri görüntüleme kayıtlarının alınabileceği konusunda bilgilendirilmiştir.

Radyolojik görüntülemelerde mümkün olan en düşük doz prensibiyle çalışılacağı, hamilelik veya hamilelik şüphesi varsa hastanın bunu hekime bildirmesi gerektiği açıklanmıştır. Görüntüler hasta dosyasında saklanabilir ve tedavi planlaması, konsültasyon, laboratuvar iletişimi veya yasal kayıt amacıyla kullanılabilir.

## 5. Genel Tedavi Riskleri ve Alternatifler
Hasta, uygulanacak tedavilerde ağrı, hassasiyet, kanama, şişlik, enfeksiyon, alerjik reaksiyon, geçici veya kalıcı uyuşukluk, tedavi başarısızlığı, restorasyon kırılması, estetik beklenti farklılığı, ek seans gereksinimi, tedavi planında değişiklik veya ek maliyet doğurabilecek işlemler gerekebileceği konusunda bilgilendirilmiştir.

Hasta, tedaviyi kabul etmeme, erteleme, alternatif tedavi seçeneklerini değerlendirme ve ikinci görüş alma hakkı olduğunu öğrenmiştir. Tedavinin yapılmaması halinde ağrı, enfeksiyon, diş kaybı, çiğneme fonksiyonunda bozulma, estetik kayıp veya daha kapsamlı tedavi ihtiyacı oluşabileceği açıklanmıştır.

## 6. Dolgu, Restoratif ve Estetik İşlemler
Hasta, çürük temizliği, dolgu, inley/onley, estetik restorasyon veya benzeri işlemler sırasında diş dokusunun kaldırılabileceğini, işlem sonrası sıcak-soğuk hassasiyeti, yükseklik hissi, renk uyumu farklılığı, restorasyon kırılması veya yenileme ihtiyacı oluşabileceğini kabul eder.

Derin çürüklerde sinire yakınlık nedeniyle kanal tedavisi ihtiyacı doğabileceği; restorasyonun ağız hijyeni, beslenme alışkanlıkları, bruksizm ve düzenli kontrollerden etkilendiği hastaya açıklanmıştır.

## 7. Kanal Tedavisi Onamı
Hasta, kanal tedavisinin dişin kök kanallarındaki enfekte veya hasarlı dokuların temizlenmesi, şekillendirilmesi ve doldurulması amacıyla yapıldığını öğrenmiştir. Tedavi tek seansta tamamlanabileceği gibi enfeksiyon durumuna göre birden fazla seans gerekebilir.

Tedavi sırasında veya sonrasında ağrı, hassasiyet, kanal içinde alet kırılması, kanalın bulunamaması, perforasyon, enfeksiyonun devam etmesi, şişlik, antibiyotik veya ek tedavi ihtiyacı, tedavinin başarısız olması ve dişin çekime gitmesi gibi riskler açıklanmıştır.

## 8. Periodontal İşlemler ve Diş Eti Tedavileri
Hasta, diş taşı temizliği, kök yüzeyi düzleştirme, küretaj, diş eti operasyonu veya benzeri periodontal işlemlerde hassasiyet, kanama, diş eti çekilmesi, diş aralarında açıklık hissi, geçici ağrı veya ek tedavi ihtiyacı oluşabileceği konusunda bilgilendirilmiştir.

Periodontal tedavinin başarısının ağız hijyeni, sigara kullanımı, sistemik hastalıklar ve düzenli kontrol randevularına uyumla doğrudan ilişkili olduğu hastaya açıklanmıştır.

## 9. Cerrahi İşlemler Onamı
Hasta, diş çekimi, gömülü diş çekimi, kist operasyonu, yumuşak doku işlemi, kemik düzeltme veya benzeri cerrahi işlemler hakkında bilgilendirilmiştir. İşlemin lokal anestezi altında yapılabileceği, işlem sırasında ve sonrasında ağrı, kanama, şişlik, morluk, enfeksiyon, ağız açmada kısıtlılık, dikiş ihtiyacı ve kontrol randevusu gerekebileceği açıklanmıştır.

Alt çene cerrahilerinde dudak, çene veya dil bölgesinde geçici ya da nadiren kalıcı uyuşukluk; üst çene işlemlerinde sinüs bölgesiyle ilişkili komplikasyonlar; kök veya kemik parçalarının kalması; komşu diş, dolgu veya protezlerde hasar; ek cerrahi veya ilaç tedavisi ihtiyacı oluşabileceği hasta tarafından anlaşılmıştır.

Hasta, işlem sonrası verilen ilaçları ve bakım önerilerini uygulaması gerektiğini, sigara kullanımının iyileşmeyi olumsuz etkileyebileceğini, beklenmeyen kanama veya ağrı durumunda kliniğe başvurması gerektiğini kabul eder.

## 10. İmplant Tedavisi Onamı
Hasta, dental implant tedavisinin çene kemiğine yapay kök yerleştirilmesi ve daha sonra protez aşamasıyla tamamlanması planlanan bir tedavi olduğunu öğrenmiştir. Kemik miktarı, sistemik hastalıklar, ağız hijyeni, sigara kullanımı ve düzenli kontrol randevuları implant başarısını etkileyebilir.

İşlem sırasında veya sonrasında ağrı, şişlik, kanama, enfeksiyon, implantın kemikle kaynaşmaması, implant kaybı, vida gevşemesi, protez kırılması, sinüs veya sinir komşuluğuna bağlı komplikasyonlar, ek kemik grefti veya ileri cerrahi ihtiyacı oluşabileceği açıklanmıştır.

Hasta, implant tedavisinin garanti edilen mutlak bir sonuç olmadığını, hekimin önerdiği bakım ve kontrol programına uyması gerektiğini, yetersiz ağız hijyeni ve sigara kullanımının başarısızlık riskini artırdığını kabul eder.

## 11. Protez, Kaplama ve Laboratuvar İşleri
Hasta, sabit protez, hareketli protez, kron, köprü, laminate veya benzeri restoratif/protetik işlemler hakkında bilgilendirilmiştir. Tedavi sürecinde diş kesimi, ölçü alma, dijital ölçü, prova, geçici restorasyon, laboratuvar işlemleri ve uyum kontrolleri gerekebilir.

Tedavi sonrasında sıcak-soğuk hassasiyeti, diş eti uyum sorunları, geçici restorasyon düşmesi, renk/şekil beklentilerinde revizyon ihtiyacı, protez vurukları, konuşma veya çiğneme alışkanlığında geçici değişiklikler, porselen kırığı, siman çözülmesi veya ek işlem gereksinimi oluşabileceği açıklanmıştır.

Hasta, laboratuvar kaynaklı teslim sürelerinin değişebileceğini, provalara zamanında gelmesi gerektiğini ve protezin uzun ömürlü olması için ağız hijyenine dikkat etmesi gerektiğini kabul eder.

## 12. Lokal Anestezi ve İlaç Kullanımı
Hasta, gerekli işlemlerde lokal anestezi uygulanabileceğini; anesteziye bağlı geçici uyuşukluk, çarpıntı, baş dönmesi, alerjik reaksiyon, enjeksiyon bölgesinde ağrı veya nadiren beklenmeyen tıbbi durumlar oluşabileceğini öğrenmiştir.

Hasta, reçete edilen ilaçları hekimin önerdiği şekilde kullanması gerektiğini; bilinen ilaç alerjisi, gebelik, emzirme, düzenli ilaç kullanımı veya sistemik hastalık varsa bunu hekime bildirmekle yükümlü olduğunu kabul eder.

## 13. Finansal Bilgilendirme ve Randevu Sorumluluğu
Hasta, tedavi planının kapsamına göre ücretlendirme yapılabileceğini; tedavi sırasında ek işlem gereksinimi doğarsa maliyetin değişebileceğini kabul eder. Taksit, ödeme planı, sigorta veya kurum anlaşması varsa bunların ayrıca takip edileceği hastaya açıklanmıştır.

Hasta, randevularına zamanında gelmesi gerektiğini, gecikme veya iptal durumunda kliniği önceden bilgilendirmesi gerektiğini, tedavi başarısı için kontrol randevularına uymanın önemli olduğunu kabul eder.

## 14. Hasta Yükümlülükleri ve Doğru Beyan
Hasta, sağlık geçmişi, ilaç kullanımı, alerji, hamilelik, bulaşıcı hastalık, sistemik hastalık, önceki tedavi ve şikayetleri hakkında doğru bilgi vermekle yükümlü olduğunu kabul eder. Eksik veya hatalı beyan nedeniyle doğabilecek tıbbi ve hukuki sonuçlar hakkında bilgilendirilmiştir.

Hasta, tedavi sonrası kendisine verilen bakım, hijyen, beslenme, ilaç kullanımı, kontrol randevusu ve acil başvuru talimatlarına uyması gerektiğini; bu talimatlara uyulmamasının iyileşme sürecini ve tedavi başarısını olumsuz etkileyebileceğini kabul eder.

## 15. Sonuç Garantisi, Revizyon ve Komplikasyon Yönetimi
Hasta, tıbbi ve dental işlemlerde biyolojik yanıtın kişiden kişiye değişebileceğini; estetik, fonksiyonel veya iyileşme sonucunun mutlak olarak garanti edilemeyeceğini öğrenmiştir. Hekim ve klinik, mesleki standartlara uygun hizmet sunmakla yükümlüdür; ancak tedavi sonucu hastanın ağız hijyeni, sistemik durumu, alışkanlıkları ve düzenli kontrolleriyle yakından ilişkilidir.

Beklenmeyen komplikasyon, enfeksiyon, ağrı, kırık, uyumsuzluk, alerji, kanama veya revizyon gereksinimi oluşması halinde klinik tarafından ek muayene, ilaç, işlem veya sevk önerilebileceği hastaya açıklanmıştır. Hasta, acil veya beklenmeyen durumda kliniğe bilgi vermeden kendi başına müdahale etmeyeceğini ve gecikmeden başvuracağını kabul eder.

## 16. Klinik Düzeni, Personel Güvenliği ve Hizmetin Sürdürülmesi
Hasta, klinik içinde sağlık personelinin talimatlarına uyması, hijyen ve güvenlik kurallarını gözetmesi, randevu saatlerine saygı göstermesi ve tedavi ortamının güvenliğini bozacak davranışlardan kaçınması gerektiğini kabul eder.

Klinik, sağlık personelinin güvenliğini, diğer hastaların mahremiyetini veya hizmet düzenini tehlikeye atan durumlarda randevuyu erteleme, hizmeti güvenli koşullar oluşana kadar durdurma veya ilgili mevzuat kapsamında gerekli kayıt ve bildirimleri yapma hakkını saklı tutar.

## 17. Kayıt Saklama, Denetim ve Uyuşmazlık Süreçleri
Hasta dosyası, imzalı onamlar, radyolojik görüntüler, fotoğraflar, reçeteler, ödeme kayıtları ve tedavi notları ilgili mevzuat ve klinik kayıt politikaları kapsamında saklanabilir. Bu kayıtlar yasal yükümlülükler, denetim, kalite yönetimi, hizmet sürekliliği ve olası uyuşmazlıkların çözümü için kullanılabilir.

Hasta, elektronik ortamda alınan imzanın imza tarihi, hasta bilgisi, belge numarası ve kurum kayıtlarıyla birlikte hasta dosyasında saklanacağını; imzalı belgenin gerektiğinde çıktısının alınabileceğini kabul eder.

## 18. Son Beyan ve Onay
Hasta, bu kapsamlı onam paketini okuduğunu veya kendisine okunup açıklandığını; anlamadığı noktaları sorma fırsatı bulduğunu; sorularının yanıtlandığını; kişisel veriler, görüntüleme, tedavi riskleri, alternatifler, cerrahi/implant/kanal/protez gibi işlemler, finansal süreçler ve randevu sorumlulukları hakkında bilgilendirildiğini beyan eder.

Hasta, tek imzasının bu kapsamlı onam paketinin tüm sayfaları ve bölümleri için geçerli olduğunu kabul eder.`;

async function ensureComprehensiveTemplate(institutionId: string | null) {
  const globalTemplate = await (prisma as any).consentTemplate.findFirst({
    where: { institutionId: null, title: COMPREHENSIVE_TITLE, isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { body: true },
  });
  const sourceBody = globalTemplate?.body || COMPREHENSIVE_BODY;

  const existing = await (prisma as any).consentTemplate.findFirst({
    where: { institutionId, title: COMPREHENSIVE_TITLE },
    orderBy: { updatedAt: "desc" },
    select: { id: true, body: true, isActive: true },
  });

  let activeId = existing?.id || null;
  if (!existing) {
    const created = await (prisma as any).consentTemplate.create({
      data: {
        institutionId,
        title: COMPREHENSIVE_TITLE,
        category: COMPREHENSIVE_CATEGORY,
        body: sourceBody,
      },
      select: { id: true },
    });
    activeId = created.id;
  } else if (!existing.isActive || existing.body !== sourceBody) {
    await (prisma as any).consentTemplate.update({
      where: { id: existing.id },
      data: { isActive: true, category: COMPREHENSIVE_CATEGORY, body: sourceBody },
    });
  }

  await (prisma as any).consentTemplate.updateMany({
    where: {
      institutionId,
      isActive: true,
      id: { not: activeId },
    },
    data: { isActive: false },
  });
}

export async function GET() {
  const auth = await requireAuth("documents:read");
  if (auth.error) return auth.error;

  try {
    await ensureComprehensiveTemplate(auth.user.institutionId);
    const template = await (prisma as any).consentTemplate.findFirst({
      where: { institutionId: auth.user.institutionId, title: COMPREHENSIVE_TITLE, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(template ? [template] : []);
  } catch (error) {
    console.error("[consent-templates GET]", error);
    return NextResponse.json({ message: "Onam şablonu yüklenemedi." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("documents:write");
  if (auth.error) return auth.error;

  try {
    const { title = COMPREHENSIVE_TITLE, body, category = COMPREHENSIVE_CATEGORY } = await req.json();
    if (!body?.trim()) {
      return NextResponse.json({ error: "Metin zorunlu." }, { status: 400 });
    }

    await (prisma as any).consentTemplate.updateMany({
      where: { institutionId: auth.user.institutionId, isActive: true },
      data: { isActive: false },
    });

    const created = await (prisma as any).consentTemplate.create({
      data: {
        institutionId: auth.user.institutionId,
        title: String(title || COMPREHENSIVE_TITLE).trim(),
        body: body.trim(),
        category: String(category || COMPREHENSIVE_CATEGORY),
      },
    });

    await writeAudit(auth.user.id, "CONSENT_TEMPLATE_CREATE", `"${created.title}" kapsamlı onam şablonu oluşturuldu`);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[consent-templates POST]", error);
    return NextResponse.json({ error: "Onam şablonu oluşturulamadı." }, { status: 503 });
  }
}
