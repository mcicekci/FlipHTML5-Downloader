# FlipHTML5 Downloader

FlipHTML5 üzerinde yayınlanan dijital kitapları (flipbook) sayfa görselleri olarak indirip tek bir PDF dosyasına dönüştüren masaüstü uygulamasıdır. [Electron](https://www.electronjs.org/) tabanlıdır.

Orijinal proje: [KoStard/FlipHTML5-Downloader](https://github.com/KoStard/FlipHTML5-Downloader). Bu sürüm, FlipHTML5’in güncel `config.js` ve şifreli sayfa listesi formatını destekleyecek şekilde güncellenmiştir.

## Özellikler

- Çoklu dil arayüzü (Türkçe, English, Español, Deutsch, Русский, 中文, العربية): sağ üstten dil seçimi; Arapça RTL düzeni; tercih `localStorage`’da saklanır
- Kitap URL’si, sayfa aralığı ve **PDF Oluştur** düğmesi
- İşlem sırasında ilerleme çubuğu (kitap bilgisi → sayfa indirme → PDF birleştirme)
- PDF hazır olunca **PDF'i Aç**, **Klasörde Göster** ve **Farklı Kaydet…** seçenekleri
- FlipHTML5 kitap URL’sinden otomatik sayfa listesi ve başlık okuma
- Güncel kitaplar için `javascript/config.js` ve `deString` ile şifre çözme
- Eski kitaplar için numaralı `.jpg` yolu desteği (legacy)
- **Sayfa aralığı:** yalnızca seçtiğiniz sayfaları indirme (ör. 5–12)
- WebP sayfaları PDF’e eklemeden önce JPEG’e dönüştürme (ana süreçte)
- Çıktı PDF’inin uygulama klasörüne kaydedilmesi

## Gereksinimler

- [Node.js](https://nodejs.org/) (LTS önerilir)
- İnternet bağlantısı (kitap ve FlipHTML5 kaynakları indirilirken)

## Kurulum

```bash
git clone <repo-url>
cd FlipHTML5-Downloader
npm install
```

## Çalıştırma

```bash
npm start
```

Uygulama bir Electron penceresi açar. Kitap linkini yapıştırıp **PDF Oluştur** düğmesine basın.

> **Önemli:** Uygulamayı `index.html` dosyasını tarayıcıda açarak değil, mutlaka `npm start` ile çalıştırın. Tarayıcıda `require` ve indirme işlemleri çalışmaz.

Geliştirici konsolu için (isteğe bağlı):

```bash
set FLIPHTML5_DEBUG=1
npm start
```

## Kullanım

### 1. Kitap URL’si

Tam flipbook adresini girin. Örnek format:

```
https://online.fliphtml5.com/kullanici/kitap-adi/
```

`https://` olmadan yapıştırsanız da otomatik eklenir.

### 2. Sayfa aralığı (isteğe bağlı)

| Alan | Açıklama |
|------|----------|
| **Başlangıç** | İndirilecek ilk sayfa (1 = kitabın ilk sayfası) |
| **Bitiş** | İndirilecek son sayfa (dahil) |
| **İkisi de boş** | Tüm sayfalar indirilir |
| **Sadece başlangıç** | O sayfadan kitabın sonuna kadar |
| **Sadece bitiş** | 1. sayfadan o sayfaya kadar |

Örnek: 323 sayfalık kitapta Başlangıç `1`, Bitiş `4` → yalnızca 1–4. sayfalar indirilir; PDF adı örneğin `KitapAdı_s1-4.pdf` olur.

### 3. İşlem akışı

1. **PDF Oluştur** — kitap yapılandırması okunur.
2. **Sayfalar indiriliyor…** — seçilen aralıktaki görseller indirilir; ilerleme çubuğu güncellenir.
3. **PDF oluşturuluyor…** — görseller tek PDF’de birleştirilir (WebP varsa önce JPEG’e çevrilir).
4. **PDF hazır** — dosya adı gösterilir; açma, klasör veya farklı konuma kaydetme seçenekleri sunulur.

### 4. Çıktı

- PDF varsayılan olarak uygulama klasörüne kaydedilir (`FlipHTML5-Downloader/`).
- İndirme sırasında geçici görseller kitap adına göre bir alt klasörde tutulur; PDF oluşunca silinir.
- **Farklı Kaydet…** ile aynı PDF’i istediğiniz konuma kopyalayabilirsiniz.

## Proje yapısı

| Dosya | Görev |
|-------|--------|
| `main.js` | Electron ana süreci; pencere, şifre çözme, WebP→JPEG, PDF oluşturma (IPC) |
| `view.js` | Arayüz, sayfa indirme, ilerleme ve sonuç paneli |
| `index.html` | Form, ilerleme ve sonuç bileşenleri |
| `style.css` | Arayüz stilleri |
| `i18n.js` | Dil yükleme ve çeviri (`t`) |
| `locales/*.json` | Arayüz metinleri (`tr`, `en`, `es`, `de`, `ru`, `zh`, `ar`) |

Yeni dil eklemek için `locales/` altına aynı anahtarlarla bir JSON dosyası ekleyin ve `i18n.js` içindeki `SUPPORTED` dizisine dil kodunu yazın.

## Sık karşılaşılan sorunlar

| Sorun | Olası neden / çözüm |
|-------|---------------------|
| `require is not defined` | `npm start` kullanın, HTML’i doğrudan tarayıcıda açmayın |
| Sayfa bilgisi bulunamadı | URL’nin `online.fliphtml5.com/.../.../` formatında olduğundan emin olun |
| Şifre çözme zaman aşımı | İnternet / güvenlik duvarı; FlipHTML5 `deString.js` yüklenemiyor olabilir |
| Sayfa aralığı hatası | Numaralar 1 ile toplam sayfa arasında ve başlangıç ≤ bitiş olmalı |
| WebP / görsel çözülemedi | Uygulamayı güncel sürümle `npm start` ile çalıştırın; WebP dönüşümü ana süreçte yapılır |
| Electron güvenlik uyarısı (geliştirme) | Paketlenmiş sürümde görünmez; `unsafe-eval` artık arayüzde gerekmez |

## Bilinen sınırlamalar

- Yalnızca **görsel sayfa** tabanlı flipbook’lar desteklenir (metin seçilebilir PDF export değil).
- Çok eski veya özel barındırılan kitaplarda format farklı olabilir.
- `request` ve Electron 2.x gibi eski bağımlılıklar kullanılır; uzun vadede güncelleme gerekebilir.
- PDF oluşturma sırasında arayüzde ayrıntılı sayfa sayacı yalnızca indirme aşamasında gösterilir; birleştirme ana süreçte tek adımda yapılır.

## Lisans

ISC — orijinal proje sahibi: KoStard.
