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

| Komut                                     | Açıklama                                  |
| ----------------------------------------- | ----------------------------------------- |
| `pnpm dev`                                | Sunucu ve arayüzü izleme modunda başlatır |
| `pnpm build`                              | Tüm paketleri derler                      |
| `pnpm test`                               | Tüm testleri çalıştırır                   |
| `pnpm typecheck`                          | TypeScript tip kontrolü                   |
| `pnpm lint`                               | ESLint                                    |
| `pnpm format` / `pnpm format:check`       | Prettier                                  |
| `pnpm services:up` / `pnpm services:down` | Docker servislerini başlatır / durdurur   |

Tek bir paket için: `pnpm --filter @clipboard/server test`.

## Ortam değişkenleri

Tüm değişkenler ve varsayılanları `.env.example` dosyasındadır. Sunucu açılışta bunları doğrular, geçersiz bir değer varsa hangi değişken olduğunu söyleyerek başlamayı reddeder.
