# RenderOyuncu AFK Client

`play.renderoyuncu.net` için masaüstü AFK client. Electron ve mineflayer ile yazıldı. Hesaplar oyunu açmadan, hafif bir bot olarak bağlanır.

## Çalıştırma

WebStorm'da üstteki çalıştırma listesinden **Uygulamayı Başlat** seçeneğini kullan, ya da terminalde:

```bash
npm install
npm start
```

Kurulum dosyası üretmek için:

```bash
npm run dist
```

Testler gerçek sunucuya bağlanmaz, sahte bir sunucu kullanır:

```bash
npm test
```

## Yeni sürüm yayınlama

1. `package.json` içindeki `version` değerini artır (örnek: `1.0.1`).
2. `npm run dist` çalıştır.
3. GitHub deposunda yeni bir Release aç, etiketi `v1.0.1` yap.
4. `dist` klasöründeki `.exe`, `.exe.blockmap` ve `latest.yml` dosyalarını Release'e yükleyip yayınla.

Açık uygulamalar saatte bir kontrol eder, yeni sürümü arka planda indirir ve 60 saniyelik uyarıdan sonra kurulup yeniden başlar. Güncelleme adresi `src/core/defaults.js` içindeki `UPDATE_FEED` ve `package.json` içindeki `build.publish` alanındadır.

## Özellikler

- Yalnızca `play.renderoyuncu.net` sunucusuna bağlanır; adres `src/core/defaults.js` içinde sabittir, ayarlardan değiştirilemez
- Hesaplar uygulama açılınca otomatik girer (Ayarlar > Uygulama)
- Hesap kartında Oyun Modları paneli: Survival Gard seçilince Lobi pusulasıyla otomatik geçiş
- Survival'da VIP AFK (`/vipafk`) ve Oyuncu AFK (`/oyuncuafk`); bot ölünce yeniden doğup seçimi tekrarlar
- Sohbet paneli: tek hesapla sabit 20 dakikada bir otomatik mesaj
- En fazla 3 hesap; kullanıcı adının sonu `afk1`, `afk2` veya `afk3` olmalı
- Otomatik kayıt (`/register şifre e-posta`) ve otomatik giriş (`/login`); e-posta hesaba yazılabilir, boş bırakılırsa hesap adından üretilir
- Hesap başına ayrı konsol ve ayrı süreç
- Canlı envanter; sunucu menülerini açma ve tıklama
- Anti-AFK, otomatik yeniden bağlanma, yemek yeme, yeniden doğma
- Sitedeki haberler ve sunucu oyuncu sayısı
- Minecraft 1.21 - 1.21.11 ve 26.1 doğrudan desteklenir
- Daha yeni sürümler için Java 25 ile çalışan ViaProxy köprüsü (Ayarlar > Sürüm Köprüsü)

## Klasörler

| Yol | İçerik |
| --- | --- |
| `src/core` | Bot oturumu, varsayılan ayarlar, haber çözümleyici |
| `src/main` | Electron ana süreci, hesap deposu, bot yöneticisi, köprü |
| `src/renderer` | Arayüz |
| `test` | Sahte sunucu ve testler |
| `scripts` | Eşya ikonlarını üreten betik |

Hesap şifreleri Windows'un şifreleme altyapısıyla (`safeStorage`) saklanır. Ayarlar `%APPDATA%\RenderOyuncu AFK Client\config.json` dosyasındadır.
