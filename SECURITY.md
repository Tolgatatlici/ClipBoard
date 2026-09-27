# Güvenlik

## Açık bildirimi

Bir güvenlik açığı bulduysanız lütfen herkese açık bir issue açmayın. Ayrıntıları
depo sahibine GitHub'ın **Security → Report a vulnerability** (özel bildirim) özelliğiyle
iletin. Mümkünse yeniden üretme adımlarını ve etkisini ekleyin; en geç 7 gün içinde
dönüş yapmayı hedefliyoruz.

## Tehdit modeli (özet)

| Varlık               | Koruma                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paylaşılan içerik    | Tarayıcıda AES-256-GCM; anahtar URL `#` kısmında ya da koddan türetilir, sunucuya gitmez                                                                                                          |
| Kısa kodlar (20 bit) | Sunucu erişim anahtarı doğrulanmadan veri vermez; 5 hatada kodla erişim kilitlenir; IP başına dakikada 20 deneme; en fazla 1 gün                                                                  |
| Parolalı içerik      | Link sırrı + PBKDF2 (600k) birlikte gerekir; çevrimdışı deneme için link de gerekir                                                                                                               |
| Canlı oda            | Rastgele 256 bitlik sırdan HKDF ile oda kimliği ve anahtar; sır sunucuya gitmez. Yeni cihaz ECDH (P-256) + 6 haneli doğrulama numarasıyla eklenir; eşleştirme kodu tek kullanımlık ve 5 dakikalık |
| Silme anahtarı       | Sunucuda yalnızca SHA-256 özeti                                                                                                                                                                   |
| Dosyalar             | İstemcide şifreli; imzalı, süreli ve boyuta kilitli yükleme linkleri                                                                                                                              |

**Bilinen sınırlar**

- Sunucu verisini (Redis dökümü) ele geçiren biri, kısa kodlu paylaşımların 20 bitlik gizli
  kısmını çevrimdışı deneyebilir. Hassas içerik için kısa kod kapatılmalı (yalnızca link).
- Uygulama kodu sunucudan geldiği için, sunucuyu ele geçiren biri kötü amaçlı JavaScript
  sunarak gelecekteki paylaşımların anahtarlarını çalabilir (tüm web tabanlı E2E
  uygulamalarının ortak sınırı).
- Şifreli verinin boyutu ve paylaşım zamanları sunucuya görünür.
- Cihaz eşleştirmede güvenlik, kullanıcının iki ekrandaki doğrulama numarasını gerçekten
  karşılaştırmasına bağlıdır; karşılaştırmadan onaylanırsa kötü niyetli bir sunucu araya
  girebilir (numarayı tutturma olasılığı 1/1 000 000).

## Kontrol listesi

- [x] Anahtar URL fragment'ında; `Referrer-Policy: no-referrer`
- [x] Çözülen içerik yalnızca metin olarak işlenir; kod vurgulama `innerHTML` kullanmaz
- [x] Sıkı CSP: satır içi betik/stil yok, `connect-src` yalnızca kendi sunucusu, soketler ve depolama; `frame-ancestors 'none'`; E2E testleri her sayfada CSP ihlali olmadığını doğrular
- [x] Tüm REST ve WebSocket girdilerinde Zod şema ve boyut doğrulaması
- [x] İstek sınırları: genel, oluşturma, açma, dosya, bildirim; WebSocket mesajları bağlantı başına
- [x] Kısa kod deneme sayacı ve kilidi (içeriği silmeden; başkası yanlış kodla silemez)
- [x] Tek okumalık içerik Lua ile atomik okunup silinir
- [x] Link önizleme botları içeriği tüketemez (açma `POST`; tek okumalıkta ek onay)
- [x] Günlüklerde içerik, anahtar, IP ve Authorization başlığı yok; Caddy erişim günlüğü kapalı
- [x] Hata raporlarından (Sentry) istek, kullanıcı ve iz verileri çıkarılır
- [x] Dosya indirmede `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`
- [x] Konteyner root olmayan kullanıcıyla çalışır; Redis ve depolama dış ağa açılmaz
- [x] Bağımlılık denetimi CI'da (haftalık) ve Dependabot
