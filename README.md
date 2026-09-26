# ClipBoard

Cihazlarınız arasında metin ve dosyaları **uçtan uca şifreli**, **süreli** ve **kayıt gerektirmeden** paylaşmanızı sağlayan online pano. Proje planı ve görev listesi için [docs/PLAN.md](docs/PLAN.md) dosyasına bakın.

## Proje yapısı

```
apps/
  server/     Fastify API + WebSocket sunucusu
  web/        React + Vite + Tailwind arayüzü
packages/
  shared/     Ortak sabitler, Zod şemaları ve tipler
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
pnpm services:up      # Redis + MinIO (bucket otomatik oluşturulur)
pnpm dev              # sunucu :3000, arayüz :5173
```

Arayüz http://localhost:5173 adresinde açılır. `/api` ve `/ws` istekleri Vite üzerinden sunucuya yönlendirilir. MinIO konsolu: http://localhost:9001 (`minioadmin` / `minioadmin`).

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

## Nasıl çalışır?

1. Tarayıcı her paylaşım için rastgele 256 bitlik bir anahtar üretir ve metni AES-256-GCM ile şifreler.
2. Sunucuya yalnızca şifreli veri ve erişim anahtarlarının özetleri gider; Redis'te süreli (TTL) saklanır.
3. **Link:** `/c/<id>#k=<anahtar>`. `#` sonrası tarayıcıdan hiç çıkmaz.
4. **Kısa kod:** `ABCD-EFGH`. İlk 4 karakter kimlik, son 4 karakter gizli kısımdır. Gizli kısımdan PBKDF2 ile hem içerik anahtarını açan anahtar hem de erişim anahtarı türetilir. Sunucu erişim anahtarını doğrulamadan veriyi vermez ve 5 hatalı denemeden sonra kodla erişimi kilitler (link çalışmaya devam eder).
5. Tek okumalık içerik, açıldığı istekte atomik olarak silinir.

Ayrıntılar için [docs/PLAN.md](docs/PLAN.md) § 3.3.

## Testler

Testler lokal bir Redis'e ihtiyaç duyar (`pnpm services:up`). Sunucu testleri 15 numaralı, E2E testleri 14 numaralı Redis veritabanını kullanır ve temizler.

```bash
pnpm test
pnpm --filter @clipboard/web exec playwright install chromium   # ilk seferde
pnpm --filter @clipboard/web e2e
```

Önceden kurulu bir Chromium kullanmak için `PW_CHROMIUM_PATH=/yol/chromium` ayarlayın.
