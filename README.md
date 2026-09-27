# ClipBoard

Cihazlarınız arasında metin ve dosyaları **uçtan uca şifreli**, **süreli** ve **kayıt gerektirmeden** paylaşmanızı sağlayan online pano. Proje planı ve görev listesi için [docs/PLAN.md](docs/PLAN.md) dosyasına bakın.

Belgeler: [proje planı](docs/PLAN.md) · [yayına alma](docs/DEPLOY.md) · [yük testi](docs/LOADTEST.md) · [güvenlik](SECURITY.md)

## Proje yapısı

```
apps/
  server/     Fastify API + WebSocket sunucusu
  web/        React + Vite + Tailwind arayüzü (PWA)
packages/
  shared/     Şifreleme, Zod şemaları, API istemcisi ve ortak tipler
  cli/        Komut satırı aracı (`clip put` / `clip get`)
apps/extension/   Tarayıcı eklentisi (Chrome/Edge, Manifest V3)
```

## Gereksinimler

- Node.js 22+ (`.nvmrc`)
- pnpm 10 (`corepack enable` ile otomatik gelir)
- Docker (Redis ve MinIO için)

## Kurulum

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm services:up      # Redis + SeaweedFS (S3; bucket otomatik oluşturulur)
pnpm dev              # sunucu :3000, arayüz :5173
```

Arayüz http://localhost:5173 adresinde açılır. `/api` ve `/ws` istekleri Vite üzerinden sunucuya yönlendirilir. Varsayılan dosya sürücüsü yerel disktir; S3 ile denemek için `.env` içinde `STORAGE_DRIVER=s3` yapın (SeaweedFS: http://localhost:8333).

## Komutlar

| Komut                                     | Açıklama                                      |
| ----------------------------------------- | --------------------------------------------- |
| `pnpm dev`                                | Sunucu ve arayüzü izleme modunda başlatır     |
| `pnpm build`                              | Tüm paketleri derler                          |
| `pnpm test`                               | Birim ve entegrasyon testleri (Redis gerekir) |
| `pnpm --filter @clipboard/web e2e`        | Playwright uçtan uca testleri (Redis gerekir) |
| `pnpm typecheck`                          | TypeScript tip kontrolü                       |
| `pnpm lint`                               | ESLint                                        |
| `pnpm format` / `pnpm format:check`       | Prettier                                      |
| `pnpm services:up` / `pnpm services:down` | Docker servislerini başlatır / durdurur       |

Tek bir paket için: `pnpm --filter @clipboard/server test`.

## Ortam değişkenleri

Tüm değişkenler ve varsayılanları `.env.example` dosyasındadır. Sunucu açılışta bunları doğrular, geçersiz bir değer varsa hangi değişken olduğunu söyleyerek başlamayı reddeder.

## Dosya depolama

Dosyalar tarayıcıda şifrelenip sunucuya ya da S3'e anlamsız baytlar olarak yüklenir.

- `STORAGE_DRIVER=local` (varsayılan): dosyalar `STORAGE_DIR` altında tutulur; yükleme ve indirme sunucunun imzalı, süreli linkleriyle yapılır. Birden fazla sunucu çalıştırılacaksa `FILE_SIGNING_SECRET` hepsinde aynı olmalı ve dizin paylaşılmalıdır.
- `STORAGE_DRIVER=s3`: tarayıcı presigned URL ile doğrudan S3/R2/SeaweedFS'e yükler. Bucket'ta, web uygulamasının adresinden `PUT` ve `GET` isteklerine izin veren bir CORS kuralı gerekir.

Süresi dolan, silinen ya da tek okumalık olup açılan (15 dk sonra) dosyalar sunucu tarafından dakikada bir temizlenir.

## Komut satırı aracı (`clip`)

```bash
pnpm --filter @clipboard/cli build
alias clip="node $PWD/packages/cli/dist/clip.js"     # ya da: cd packages/cli && npm link
export CLIPBOARD_SERVER=https://clip.example.com

echo "merhaba" | clip put                 # metin → kod + link
clip put rapor.pdf --ttl 1d --burn        # dosya, ilk açılışta silinir
clip put secrets.env --text --password    # parola sorulur (ya da CLIPBOARD_PASSWORD)
clip get ABCD-EFGH                        # metni yazdırır / dosyayı kaydeder
clip get "https://clip.example.com/c/…#k=…" -o cikti.txt
```

Şifreleme web uygulamasıyla aynıdır; CLI ile paylaşılan içerik tarayıcıda, tarayıcıda paylaşılan içerik CLI ile açılabilir. Tüm seçenekler için `clip --help`.

## Tarayıcı eklentisi

Chrome/Edge (Manifest V3) eklentisi: açılır pencereden metin ya da bulunulan sayfanın linkini şifreli paylaşma, kodla açma ve sağ tık menüsüyle seçili metni paylaşma.

```bash
EXTENSION_DEFAULT_SERVER=https://clip.example.com pnpm --filter @clipboard/extension build
# chrome://extensions → Geliştirici modu → "Paketlenmemiş öğe yükle" → apps/extension/dist
```

Eklenti yalnızca derlemede verilen sunucuya erişim izni ister; ayarlarda başka bir sunucu girilirse izin o anda sorulur. Şifreleme eklentinin içinde yapılır.

## Nasıl çalışır?

1. Tarayıcı her paylaşım için rastgele 256 bitlik bir anahtar üretir ve metni AES-256-GCM ile şifreler.
2. Sunucuya yalnızca şifreli veri ve erişim anahtarlarının özetleri gider; Redis'te süreli (TTL) saklanır.
3. **Link:** `/c/<id>#k=<anahtar>`. `#` sonrası tarayıcıdan hiç çıkmaz.
4. **Kısa kod:** `ABCD-EFGH`. İlk 4 karakter kimlik, son 4 karakter gizli kısımdır. Gizli kısımdan PBKDF2 ile hem içerik anahtarını açan anahtar hem de erişim anahtarı türetilir. Sunucu erişim anahtarını doğrulamadan veriyi vermez ve 5 hatalı denemeden sonra kodla erişimi kilitler (link çalışmaya devam eder).
5. **Parola:** Link bir "link sırrı" taşır; ana anahtar, link sırrı ve paroladan (PBKDF2, 600k) türetilen anahtarla sarmalanır. Açmak için ikisi de gerekir; parolalı paylaşımlarda kısa kod yoktur.
6. **Dosyalar:** Dosya ayrı bir anahtarla şifrelenir; dosya adı ve türü de şifreli içerik başlığındadır.
7. Tek okumalık içerik, açıldığı istekte atomik olarak silinir.
8. **Canlı oda:** Her oda rastgele 256 bitlik bir sırdan türetilir (HKDF → sunucunun gördüğü oda kimliği + mesaj anahtarı). Sır link/QR'ın `#` kısmında taşınır ya da **ECDH eşleştirmesiyle** aktarılır: odadaki cihaz 6 haneli bir kod gösterir, yeni cihaz kodu girer, iki cihaz sunucu üzerinden P-256 açık anahtarlarını değiştirir ve iki ekranda aynı 6 haneli doğrulama numarasını gösterir; kullanıcı onaylayınca sır şifreli gönderilir. Sunucu araya girerse numaralar farklı çıkar. Mesajlar WebSocket ile iletilir, Redis Pub/Sub sayesinde birden fazla sunucu örneği çalışabilir; oda son 50 öğeyi tutar ve 24 saat hareketsiz kalınca silinir.

Ayrıntılar için [docs/PLAN.md](docs/PLAN.md) § 3.3.

## Testler

Testler lokal bir Redis'e ihtiyaç duyar (`pnpm services:up`). Sunucu testleri 15 numaralı, E2E testleri 14 numaralı Redis veritabanını kullanır ve temizler.

```bash
pnpm test
pnpm --filter @clipboard/web exec playwright install chromium   # ilk seferde
pnpm --filter @clipboard/web e2e
```

Önceden kurulu bir Chromium kullanmak için `PW_CHROMIUM_PATH=/yol/chromium` ayarlayın.

Diğer test seçenekleri:

- `S3_TEST_ENDPOINT=http://localhost:8333 pnpm --filter @clipboard/server test`: S3 sürücüsünü docker compose'daki SeaweedFS'e karşı test eder.
- `E2E_STORAGE_DRIVER=s3`: E2E testlerinde dosyalar SeaweedFS'e yüklenir.
- `E2E_BASE_URL=https://localhost E2E_IGNORE_HTTPS_ERRORS=1`: E2E testlerini çalışan bir kuruluma (ör. `deploy/` ile `DOMAIN=localhost`) karşı koşar. Service worker yalnızca üretim derlemesinde çalıştığından PWA testleri (`e2e/pwa.spec.ts`) sadece bu modda koşar.
- Her E2E testi, sayfada CSP ihlali ya da yakalanmamış hata olursa başarısız olur; erişilebilirlik (axe, WCAG 2.1 AA) testleri `e2e/a11y.spec.ts` içindedir.
