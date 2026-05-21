# FlipHTML5 Downloader

FlipHTML5 üzerinde yayınlanan dijital kitapları (flipbook) sayfa görselleri olarak indirip tek bir PDF dosyasına dönüştüren masaüstü uygulamasıdır. [Electron](https://www.electronjs.org/) tabanlıdır.

Orijinal proje: [KoStard/FlipHTML5-Downloader](https://github.com/KoStard/FlipHTML5-Downloader). Bu sürüm, FlipHTML5’in güncel `config.js` ve şifreli sayfa listesi formatını destekleyecek şekilde güncellenmiştir.

## Özellikler

- FlipHTML5 kitap URL’sinden otomatik sayfa listesi ve başlık okuma
- Güncel kitaplar için `javascript/config.js` ve `deString` ile şifre çözme
- Eski kitaplar için numaralı `.jpg` yolu desteği (legacy)
- **Sayfa aralığı:** yalnızca seçtiğiniz sayfaları indirme (ör. 5–12)
- WebP sayfaları PDF’e eklemeden önce JPEG’e dönüştürme
- Çıktı PDF’inin proje klasörüne kaydedilmesi

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

Uygulama bir Electron penceresi açar. Kitap linkini yapıştırıp **Download** düğmesine basın.

> **Önemli:** Uygulamayı `index.html` dosyasını tarayıcıda açarak değil, mutlaka `npm start` ile çalıştırın. Tarayıcıda `require` ve indirme işlemleri çalışmaz.

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

Örnek: 40 sayfalık kitapta Başlangıç `5`, Bitiş `12` → yalnızca 5–12. sayfalar indirilir; PDF adı örneğin `KitapAdı_s5-12.pdf` olur.

### 3. Çıktı

- PDF, uygulama klasörüne kaydedilir (`FlipHTML5-Downloader/`).
- İndirme sırasında geçici görseller kitap adına göre bir alt klasörde tutulur; PDF oluşunca silinir.

## Proje yapısı

| Dosya | Görev |
|-------|--------|
| `main.js` | Electron ana süreci, pencere ve sayfa şifre çözme (IPC) |
| `view.js` | Arayüz, indirme, PDF oluşturma |
| `index.html` | URL ve sayfa aralığı formu |

## Sık karşılaşılan sorunlar

| Sorun | Olası neden / çözüm |
|-------|---------------------|
| `require is not defined` | `npm start` kullanın, HTML’i doğrudan tarayıcıda açmayın |
| Sayfa bilgisi bulunamadı | URL’nin `online.fliphtml5.com/.../.../` formatında olduğundan emin olun |
| Şifre çözme zaman aşımı | İnternet / güvenlik duvarı; FlipHTML5 `deString.js` yüklenemiyor olabilir |
| Sayfa aralığı hatası | Numaralar 1 ile toplam sayfa arasında ve başlangıç ≤ bitiş olmalı |

## Bilinen sınırlamalar

- Yalnızca **görsel sayfa** tabanlı flipbook’lar desteklenir (metin seçilebilir PDF export değil).
- Çok eski veya özel barındırılan kitaplarda format farklı olabilir.
- `request` ve Electron 2.x gibi eski bağımlılıklar kullanılır; uzun vadede güncelleme gerekebilir.

## Lisans

ISC — orijinal proje sahibi: KoStard.
