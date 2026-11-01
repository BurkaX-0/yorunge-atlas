# Yörünge

<div align="center">

![Yörünge — yıldızların altında odaklan](public/yorunge-deep-space.png)

### Her çalışma seansı, kendi yörüngeni kurar.

Türkçe arayüzlü, uzay temalı bir Pomodoro deneyimi. Dersini ve konunu kendin yaz; odağını başlat, ilerlemeni gökyüzünde izle.

<br />

**React · TypeScript · Vite · WebGL · Ücretsiz**

</div>

---

## Proje hakkında

Yörünge; kısa çalışma seanslarını daha düzenli ve keyifli hale getirmek için tasarlanmış bir odak uygulamasıdır. Sade bir zamanlayıcıyı, kişisel çalışma istatistiklerini ve üç boyutlu bir gökyüzü deneyimini bir araya getirir. Havacılık ve uzaydan ilham alan ufak mesajlar arayüzde yol arkadaşlığı eder; çalışma alanı ise her bölümden üniversite öğrencisinin kendi ders ve konu adlarını girebileceği şekilde açıktır.

## Öne çıkanlar

| Alan | Deneyim |
| --- | --- |
| **Odak** | Pomodoro ve kronometre, duraklatma/devam, süre ayarı ve isteğe bağlı bildirimler |
| **Kişisel çalışma alanı** | Ders, konu ve çalışma hedefini serbestçe yazma |
| **İlerleme** | Seans geçmişi, haftalık odak görünümü, seri, rozetler ve çalışma ısı haritası |
| **Gökyüzüm** | WebGL ile çizilen, etkileşimli dönen gezegen ve kişisel yıldız haritası |
| **İstasyonlar** | Arkadaşlarla odak deneyimi için sosyal arayüz prototipi |
| **Kişiselleştirme** | Beş tema, mobil uyumlu sayfalar ve isteğe bağlı ambiyans sesi |

## Ekranlar

- **Ana sayfa:** günün odağına hızlıca başla.
- **Zamanlayıcı:** çalışma ve mola seanslarını yönet.
- **İstasyonlar:** arkadaş ve sohbet deneyimine ayrılmış alanı keşfet.
- **Gökyüzüm:** üç boyutlu gezegen sahnesinde çalışma yolculuğunu gör.
- **Profil:** seanslarından oluşan kişisel ilerlemeni incele.

## Yerelde çalıştırma

### Gereksinimler

- Node.js 20 veya üzeri
- npm

### Kurulum

```bash
git clone https://github.com/BurkaX-0/yorunge-atlas.git
cd yorunge-atlas
npm ci
npm run dev
```

Vite geliştirme sunucusunun adresi terminalde görünür; genellikle `http://localhost:5173` olur.

Üretim derlemesini oluşturmak ve yerelde önizlemek için:

```bash
npm run build
npm run preview
```

## Teknoloji

- **React 18** ve **TypeScript** — kullanıcı arayüzü
- **Vite** — geliştirme ve üretim derlemesi
- **WebGL** — etkileşimli uzay sahnesi
- **Framer Motion** — arayüz hareketleri
- **Lucide** — arayüz simgeleri

## Veri ve mevcut durum

Bu depodaki sürüm, tarayıcıda çalışan bir arayüz prototipidir. Zamanlayıcı tercihleri, çalışma geçmişi ve prototip profil/sosyal etkileşimleri cihazın yerel tarayıcı depolamasında saklanır. Şu an hesap oluşturma, parola ile oturum açma, arkadaşlık isteklerini başka kullanıcılara iletme veya cihazlar arasında canlı sohbet sağlayan bir API kodu bulunmuyor.

Vercel projesi için ücretsiz Upstash Redis kaynağı oluşturulup projeye bağlandı. Bu kaynak, uygulamadaki sosyal özelliklere henüz bağlanmış değildir; gerçek üyelik ve çok kullanıcılı sohbetin tamamlanması için sunucu API’si, güvenli kimlik doğrulama ve Redis veri modeli ayrıca uygulanmalıdır. Kaynakta Upstash anahtarı veya başka bir gizli anahtar tutulmaz.

## Görsel kaynakları

Uzay panoraması bu proje için özgün olarak üretildi. Diğer sahne ayrıntıları uygulama içindeki SVG ve WebGL çizimlerinden oluşur. Daha fazla bilgi için [CREDITS.md](CREDITS.md) dosyasına bak.

## Katkı ve lisans

Öneri veya hata bildirimi için GitHub Issues kullanabilirsin. Depo herkese açık olsa da henüz bir açık kaynak lisansı eklenmemiştir; açık bir lisans eklenene kadar kodun yeniden kullanım hakları saklıdır.
