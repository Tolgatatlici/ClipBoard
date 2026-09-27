# ClipBoard — Online Pano Uygulaması Proje Planı

> Referanslar: [codeshack.io/online-clipboard](https://codeshack.io/online-clipboard/) (metni kaydet → kısa kod al → başka cihazda kodla geri al) ve [copypaste.me](https://copypaste.me/) (iki cihazı ortak bir oda koduyla eşleştir, gerçek zamanlı ve uçtan uca şifreli metin/dosya aktar).
>
> Hedef: Bu iki modeli tek üründe birleştiren, **kayıt gerektirmeyen**, **uçtan uca şifreli**, **süreli (otomatik silinen)** ve **gerçek zamanlı** bir web panosu.

---

## 1. Ürün Vizyonu

Kullanıcı bir cihazda (ör. iş bilgisayarı) metin/dosya yapıştırır; başka bir cihazda (ör. telefon) kısa bir kod, QR kod veya link ile anında erişir. Sunucu içeriği **okuyamaz**, içerik belirlenen süre sonunda **kendiliğinden silinir**.

### 1.1 Kullanım Modları

| Mod                  | Açıklama                                                                                                                                         | Referans     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| **Clip (Paylaşım)**  | Metni/dosyayı yapıştır → "Kaydet" → 6 haneli kod + link + QR üret. Diğer cihaz kodu girip içeriği alır. Süre / tek okumalık / şifre seçenekleri. | codeshack    |
| **Room (Canlı Oda)** | İki veya daha fazla cihaz aynı oda koduna bağlanır. Birinin yapıştırdığı her şey diğerlerinde anında görünür (WebSocket).                        | copypaste.me |

### 1.2 Hedef Kullanıcılar

- Kendi cihazları arasında hızlıca metin/link/şifre/kod parçası taşımak isteyenler
- USB, e-posta, mesajlaşma uygulaması kullanmak istemeyen ya da kullanamayan (ortak/kurumsal bilgisayar) kişiler
- Geliştiriciler (kod parçası, log, komut paylaşımı)

---

## 2. Gereksinimler

### 2.1 Fonksiyonel Gereksinimler

**MVP (Faz 1)**

- FR-01: Kullanıcı metin yapıştırıp kaydedebilmeli (maks. 100 KB metin).
- FR-02: Kaydedilen içerik için benzersiz, kısa, okunabilir bir **kod** (ör. `K7P-4QX`) ve **paylaşım linki** üretilmeli.
- FR-03: Kod girilerek veya link açılarak içerik görüntülenebilmeli.
- FR-04: Tek tıkla "Panoya kopyala" butonu.
- FR-05: Son kullanma süresi seçimi: 5 dk, 1 saat, 1 gün, 7 gün (varsayılan 1 saat).
- FR-06: **Tek okumalık** (burn after reading) seçeneği.
- FR-07: Süresi dolan içerik otomatik silinmeli.
- FR-08: Link için **QR kod** gösterimi (telefonla okutmak için).
- FR-09: İçerik **istemci tarafında şifrelenmeli** (sunucu düz metni görmez).

**v1 (Faz 2)**

- FR-10: **Canlı oda** modu: oda oluştur / koda katıl, WebSocket ile gerçek zamanlı senkron.
- FR-11: Odada bağlı cihaz sayısı ve "karşı taraf yazıyor/bağlandı" göstergesi.
- FR-12: Oda geçmişi (odadaki son N öğe, oda süresi boyunca).
- FR-13: **Dosya/görsel paylaşımı** (maks. 25 MB, şifreli, drag & drop, panodan görsel yapıştırma).
- FR-14: Opsiyonel **parola koruması** (anahtar paroladan PBKDF2/Argon2 ile türetilir).
- FR-15: Kullanıcı içeriği süresi dolmadan **manuel silebilmeli** (silme token'ı ile).
- FR-16: Söz dizimi vurgulama (kod parçaları için) ve "düz metin / kod" seçimi.

**v2 (Faz 3 – opsiyonel)**

- FR-17: Opsiyonel hesap (e-posta magic link / OAuth) → kalıcı cihaz eşleştirme, geçmiş listesi.
- FR-18: PWA: ana ekrana ekleme, Web Share Target (telefonda "Paylaş → ClipBoard").
- FR-19: Tarayıcı eklentisi (Chrome/Firefox): seçili metni tek tıkla gönder.
- FR-20: Çoklu dil (TR / EN), koyu/açık tema.
- FR-21: Basit REST API + CLI (`clip put < file.txt`, `clip get K7P4QX`).

### 2.2 Fonksiyonel Olmayan Gereksinimler

| Kategori              | Gereksinim                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Güvenlik**          | AES-256-GCM ile istemci tarafı şifreleme; anahtar URL fragment'ında (`#key`) taşınır, sunucuya gitmez. HTTPS zorunlu, HSTS, sıkı CSP. |
| **Gizlilik**          | IP adresleri içerikle birlikte saklanmaz; loglar anonimleştirilir; KVKK/GDPR uyumlu gizlilik metni.                                   |
| **Performans**        | Kaydetme/okuma p95 < 300 ms; canlı odada mesaj gecikmesi p95 < 200 ms.                                                                |
| **Ölçeklenebilirlik** | Stateless API; WebSocket için Redis Pub/Sub ile yatay ölçekleme.                                                                      |
| **Erişilebilirlik**   | WCAG 2.1 AA; klavye ile tam kullanım; ekran okuyucu etiketleri.                                                                       |
| **Uyumluluk**         | Son 2 sürüm Chrome, Firefox, Safari, Edge; iOS Safari & Android Chrome.                                                               |
| **Kullanılabilirlik** | Kayıt yok; ilk ekranda tek adımda paylaşım; mobil öncelikli tasarım.                                                                  |
| **Dayanıklılık**      | %99.5 uptime hedefi; içerik geçici olduğu için yedekleme gereksiz, sadece konfigürasyon yedeklenir.                                   |
| **Kötüye kullanım**   | IP bazlı rate limit, boyut limitleri, CAPTCHA (şüpheli trafikte), rapor/abuse formu.                                                  |

---

## 3. Mimari

### 3.1 Önerilen Teknoloji Yığını

| Katman             | Teknoloji                                                                 | Neden                                                                           |
| ------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Frontend           | **React + TypeScript + Vite**, Tailwind CSS, React Router                 | Hızlı, basit SPA; SSR gerekmiyor (içerik şifreli, SEO yalnızca ana sayfa için). |
| Kripto             | **Web Crypto API** (AES-GCM, PBKDF2)                                      | Tarayıcıda yerleşik, ek bağımlılık yok.                                         |
| Backend            | **Node.js 22 + Fastify + TypeScript**                                     | Hafif, hızlı; `@fastify/websocket` ile WS desteği.                              |
| Gerçek zamanlı     | **WebSocket** (`ws`) + **Redis Pub/Sub**                                  | Çoklu instance arasında oda mesajlarını dağıtmak için.                          |
| Veri deposu        | **Redis** (TTL'li anahtarlar)                                             | Tüm içerik geçici → Redis'in `EXPIRE` özelliği otomatik silmeyi bedavaya verir. |
| Dosya deposu       | **S3 uyumlu** (Cloudflare R2 / MinIO) + lifecycle kuralı                  | Şifreli blob'lar; presigned URL ile doğrudan yükleme.                           |
| Kalıcı DB (Faz 3)  | PostgreSQL + Prisma/Drizzle                                               | Sadece hesap özelliği eklenirse.                                                |
| Doğrulama          | **Zod** (frontend + backend ortak şema)                                   | Tek kaynaktan tip güvenliği.                                                    |
| Test               | Vitest, Supertest, Playwright                                             | Birim, entegrasyon, E2E.                                                        |
| Monorepo           | pnpm workspaces (`apps/web`, `apps/server`, `packages/shared`)            | Ortak tipler ve şemalar.                                                        |
| Dağıtım            | Docker; Fly.io / Railway / Hetzner VPS + Caddy; frontend Cloudflare Pages | WebSocket için kalıcı süreç gerekiyor (serverless uygun değil).                 |
| CI/CD              | GitHub Actions                                                            | Lint, test, build, deploy.                                                      |
| Gözlemlenebilirlik | Pino log, Prometheus metrikleri / Grafana, Sentry                         | Hata ve performans takibi.                                                      |

### 3.2 Mimari Diyagram

```
 ┌───────────────┐         HTTPS / WSS          ┌──────────────────────┐
 │  Tarayıcı A   │ ───────────────────────────▶ │  Caddy / CDN (TLS)   │
 │ (şifreler)    │                              └──────────┬───────────┘
 └───────────────┘                                         │
 ┌───────────────┐                              ┌──────────▼───────────┐
 │  Tarayıcı B   │ ◀──── WS (oda mesajları) ─── │  Fastify API + WS    │ x N instance
 │ (çözer)       │                              └───┬──────────┬───────┘
 └───────────────┘                                  │          │
        │ presigned PUT/GET                  ┌──────▼───┐  ┌───▼───────────┐
        └──────────────────────────────────▶ │ S3 / R2  │  │ Redis          │
                                             │ (şifreli │  │ - clip:{id}    │
                                             │  dosya)  │  │ - room:{id}    │
                                             └──────────┘  │ - rate limit   │
                                                           │ - Pub/Sub      │
                                                           └────────────────┘
```

### 3.3 Uçtan Uca Şifreleme Akışı

**Clip modu (Faz 1'de uygulandı):**

1. İstemci rastgele 256-bit ana anahtar `K` ve clip kimliği (`id`) üretir.
2. İçerik `AES-256-GCM(HKDF(K, "content-key"), IV, plaintext, AAD=id)` ile şifrelenir.
3. Link erişim anahtarı `HKDF(K, "link-auth")`; sunucu yalnızca SHA-256 özetini saklar.
4. Paylaşım linki: `https://clip.example.com/c/{id}#k={base64url(K)}`. `#` sonrası sunucuya **asla** gitmez.
5. **Kısa kod** (`ABCD-EFGH`): ilk 4 karakter `id`, son 4 karakter `secret` (Crockford Base32, 20 bit).
   - `PBKDF2(secret, salt="clipboard/v1/code:"+id, 300k)` → 512 bit. İlk yarısı `K`'yı sarmalar (`wrappedKey`), ikinci yarısı kod erişim anahtarıdır (sunucuda özeti).
   - Sunucu doğru erişim anahtarı gelmeden şifreli veriyi vermez; `id` başına 5 hatalı denemede kodla erişim kilitlenir (link çalışmaya devam eder, içerik silinmez → başkası yanlış kod girerek silemez).
   - Kısa kodlu clip'ler en fazla 1 gün yaşar; IP başına dakikada 20 açma denemesi sınırı vardır.
   - Kalan risk: Redis dökümüne erişen biri 20 bitlik `secret`'ı çevrimdışı deneyebilir. Hassas veri için "Kısa kod oluştur" kapatılabilir; o zaman `id` 12 karakterdir ve yalnızca link çalışır.
6. Parola seçeneği (Faz 2): `K`, `PBKDF2(parola, salt, 600k)` ile sarmalanır.

**Room modu (Faz 2, Faz 4'te güncellendi):**

- Her oda rastgele 256 bitlik bir sırla oluşturulur: `HKDF(sır)` → sunucunun gördüğü `roomId` (128 bit) ve mesaj anahtarı. Link `/r#<sır>`; sır sunucuya gitmez. (Faz 2'deki 10 karakterlik oda kodu + PBKDF2 yaklaşımı, veritabanı sızıntısında deneme-yanılmaya açık olduğu için kaldırıldı.)
- Her öğe `AES-GCM(roomKey, başlık + gövde, AAD=roomId)` ile şifrelenir; dosya öğeleri dosyanın kendi rastgele anahtarını şifreli başlıkta taşır.
- **Kodla cihaz ekleme (T4.6, ECDH):** Odadaki cihaz `POST /api/pairings` ile tek kullanımlık, 5 dakikalık 6 haneli kod alır. İki cihaz `/ws/pair/:kod` kanalında (en fazla 2 katılımcı) P-256 açık anahtarlarını değiştirir; `HKDF(ECDH ‖ SHA-256(kod ‖ açık anahtarlar))` → aktarım anahtarı + 6 haneli doğrulama numarası (SAS). Numaralar iki ekranda aynıysa kullanıcı onaylar, oda sırrı bu anahtarla şifrelenip gönderilir ve kod silinir. Sunucu araya girerse numaralar farklı çıkar.

### 3.4 Veri Modeli (Redis)

```
clip:{id}            HASH   { kind, ct, iv, wk?, wiv?, linkAuth, codeAuth?,
                              burn: 0|1, del, exp, fails }          (*Auth/del = SHA-256 özet)
                     EXPIRE ttl
room:{roomId}:items  LIST   [ { id, ts, ct, iv } ]             LTRIM son 50, EXPIRE 24h (aktivitede yenilenir)
room:{roomId}:peers  ZSET   connectionId → son heartbeat        (presence, 90 sn zaman aşımı)
room:{roomId}:events PUBSUB sunucu örnekleri arası olay dağıtımı
file:{fileId}        HASH   { size, deleteAt }
files:gc             ZSET   fileId → silinme zamanı              (dakikada bir temizlenir)
rl:{ip}:{route}      STRING sayaç                                EXPIRE 60s
```

**ID üretimi:** Crockford Base32 (I, L, O, U yok), istemcide üretilir; sunucu Lua script ile yalnızca boşsa yazar, çakışmada `409` döner ve istemci yeni kimlikle tekrar dener.

### 3.5 REST API

| Metot    | Yol                   | Açıklama                                                         |
| -------- | --------------------- | ---------------------------------------------------------------- |
| `POST`   | `/api/clips`          | Şifreli clip oluştur → `{ id, deleteToken, expiresAt }`          |
| `GET`    | `/api/clips/:id`      | Meta bilgi: `{ expiresAt, burnAfterRead, hasCode }` (içerik yok) |
| `POST`   | `/api/clips/:id/open` | `{ method: link                                                  | code, token }` → şifreli içerik; burn ise atomik sil (Lua) |
| `DELETE` | `/api/clips/:id`      | `Authorization: Bearer {deleteToken}` ile sil                    |
| `POST`   | `/api/files/presign`  | Dosya yükleme için presigned PUT URL (boyut kontrolü)            |
| `GET`    | `/api/files/:id`      | Presigned GET URL                                                |
| `POST`   | `/api/rooms`          | Yeni oda kodu üret                                               |
| `GET`    | `/api/health`         | Sağlık kontrolü                                                  |

Tüm istek/cevaplar `packages/shared` içindeki Zod şemalarıyla doğrulanır.

### 3.6 WebSocket Protokolü (`/ws/rooms/:roomId`)

```jsonc
// İstemci → Sunucu
{ "type": "item",   "payload": { "ct": "...", "iv": "...", "kind": "text" } }
{ "type": "typing" }
{ "type": "clear" }
{ "type": "ping" }

// Sunucu → İstemci
{ "type": "welcome", "peers": 2, "history": [ ... ] }
{ "type": "item",    "payload": { ... }, "ts": 1727370000, "from": "conn_x" }
{ "type": "presence","peers": 3 }
{ "type": "typing",  "from": "conn_x" }
{ "type": "error",   "code": "RATE_LIMITED" }
```

- Mesaj boyutu limiti: 128 KB; bağlantı başına 20 mesaj/10 sn.
- Heartbeat 30 sn; yanıt vermeyen bağlantı kapatılır.
- Çoklu instance: her mesaj `PUBLISH room:{roomId}` ile yayılır.

### 3.7 Frontend Sayfaları

| Rota                           | İçerik                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `/`                            | Büyük metin alanı, "Kaydet" butonu, seçenekler (süre, tek okuma, parola), "Kod ile al" kutusu, "Canlı oda başlat" butonu |
| `/c/:id`                       | İçerik görüntüleme (şifre çözme, kopyala, indir, sil, kalan süre)                                                        |
| `/r/:code`                     | Canlı oda: öğe akışı, giriş alanı, dosya bırakma alanı, bağlı cihaz sayısı, QR                                           |
| `/about`, `/privacy`, `/terms` | Nasıl çalışır, gizlilik, kullanım şartları                                                                               |
| `/*`                           | 404 / "içerik süresi dolmuş" sayfası                                                                                     |

**Bileşenler:** `ClipEditor`, `OptionsPanel`, `ShareResult` (kod + link + QR + kopyala), `CodeInput` (6 kutulu OTP tarzı), `ClipViewer`, `RoomFeed`, `RoomItem`, `DropZone`, `CountdownTimer`, `Toast`, `ThemeToggle`.

---

## 4. Proje Yapısı

```
ClipBoard/
├── apps/
│   ├── web/                 # React + Vite frontend
│   │   ├── src/
│   │   │   ├── pages/       # Home, ClipView, Room, Static
│   │   │   ├── components/
│   │   │   ├── lib/crypto.ts    # encrypt/decrypt/deriveKey
│   │   │   ├── lib/api.ts       # REST istemcisi
│   │   │   ├── lib/ws.ts        # WS istemcisi + yeniden bağlanma
│   │   │   └── i18n/
│   │   └── e2e/             # Playwright testleri
│   └── server/              # Fastify backend
│       ├── src/
│       │   ├── routes/      # clips, files, rooms, health
│       │   ├── ws/          # oda yönetimi, pubsub
│       │   ├── services/    # redis, s3, id-generator
│       │   ├── plugins/     # rate-limit, cors, security headers
│       │   └── config.ts
│       └── test/
├── packages/
│   └── shared/              # Zod şemaları, tipler, sabitler (limitler, TTL seçenekleri)
├── docker-compose.yml       # redis, minio, server, web (lokal geliştirme)
├── .github/workflows/ci.yml
└── docs/PLAN.md
```

---

## 5. Görev Listesi (Task Breakdown)

Tahminler tek geliştirici için yaklaşık **gün (g)** cinsindendir.

### Faz 0 — Kurulum (≈ 2 g)

- [x] T0.1 pnpm monorepo iskeleti (`apps/web`, `apps/server`, `packages/shared`) — 0.5 g
- [x] T0.2 TypeScript, ESLint, Prettier, EditorConfig ortak ayarları — 0.25 g
- [x] T0.3 `docker-compose.yml`: Redis + MinIO — 0.25 g
- [x] T0.4 GitHub Actions CI: install → lint → typecheck → test → build — 0.5 g
- [x] T0.5 Ortam değişkenleri (`.env.example`), config doğrulama (Zod) — 0.25 g
- [x] T0.6 README: lokal kurulum ve çalıştırma — 0.25 g

### Faz 1 — MVP: Metin Clip (≈ 8–10 g)

**Backend**

- [x] T1.1 Fastify sunucusu, health endpoint, Pino log, graceful shutdown — 0.5 g
- [x] T1.2 Redis servisi ve bağlantı yönetimi — 0.25 g
- [x] T1.3 ID/kod üretici (Crockford Base32, çakışma kontrolü) + testleri — 0.5 g
- [x] T1.4 `POST /api/clips` (şema doğrulama, boyut limiti, TTL, deleteToken hash) — 1 g
- [x] T1.5 `GET /api/clips/:id` + burn-after-read için atomik Lua script — 0.75 g
- [x] T1.6 `DELETE /api/clips/:id` — 0.25 g
- [x] T1.7 Kısa kod deneme sayacı ve brute-force koruması — 0.5 g
- [x] T1.8 Rate limit (`@fastify/rate-limit` + Redis), CORS, güvenlik başlıkları (`@fastify/helmet`) — 0.5 g
- [x] T1.9 Entegrasyon testleri (Supertest + test Redis) — 1 g

**Frontend**

- [x] T1.10 Vite + React + Tailwind + Router kurulumu, layout, tema — 0.5 g
- [x] T1.11 `lib/crypto.ts`: anahtar üretimi, AES-GCM encrypt/decrypt, PBKDF2, base64url + birim testleri — 1 g
- [x] T1.12 Ana sayfa: editör, seçenekler paneli, kaydet akışı — 1 g
- [x] T1.13 `ShareResult`: kod, link, QR (`qrcode` kütüphanesi), kopyala butonları — 0.5 g
- [x] T1.14 `CodeInput` ile kodla alma ve `/c/:id` görüntüleme sayfası (geri sayım, kopyala, sil) — 1 g
- [x] T1.15 Hata durumları: bulunamadı, süresi doldu, yanlış anahtar, ağ hatası — 0.5 g
- [x] T1.16 Playwright E2E: oluştur → linkle aç → içerik eşleşir; burn sonrası 404 — 1 g

**Kabul kriteri:** Bir cihazda metin kaydedilip diğer cihazda kod/link/QR ile açılabiliyor; sunucu veritabanında yalnızca şifreli veri var; süre dolunca içerik yok.

### Faz 2 — v1: Canlı Oda + Dosya (≈ 10–12 g)

**Canlı oda**

- [x] T2.1 `@fastify/websocket` entegrasyonu, bağlantı yaşam döngüsü, heartbeat — 1 g
- [x] T2.2 Oda yönetimi: katılma, presence, geçmiş (Redis LIST), TTL yenileme — 1 g
- [x] T2.3 Redis Pub/Sub ile çoklu instance yayını — 1 g
- [x] T2.4 WS mesaj şeması doğrulama, mesaj rate limit, boyut limiti — 0.5 g
- [x] T2.5 Frontend `lib/ws.ts`: bağlanma, exponential backoff ile yeniden bağlanma, kuyruk — 1 g
- [x] T2.6 Oda sayfası: akış, giriş alanı, typing/presence göstergesi, QR ile davet — 1.5 g
- [x] T2.7 Oda anahtarı türetme (HKDF) ve öğe şifreleme — 0.5 g

**Dosya paylaşımı**

- [x] T2.8 S3/R2 servisi, presigned PUT/GET, lifecycle kuralı — 1 g _(+ geliştirme için yerel disk sürücüsü)_
- [x] T2.9 İstemci tarafında dosya şifreleme, yükleme ilerleme çubuğu — 1.5 g _(25 MB sınırında tek parça AES-GCM yeterli; limit büyürse chunk'lı şifrelemeye geçilir)_
- [x] T2.10 DropZone + panodan görsel yapıştırma (`paste` event) + görsel önizleme — 1 g

**Diğer**

- [x] T2.11 Parola koruması (UI + PBKDF2 akışı) — 0.5 g
- [x] T2.12 Kod modu: söz dizimi vurgulama (lowlight, lazy load, innerHTML'siz) — 0.5 g
- [x] T2.13 Testler: WS entegrasyon testleri, iki tarayıcılı Playwright oda senaryosu — 1.5 g

**Kabul kriteri:** İki cihaz aynı odaya bağlandığında birinin gönderdiği metin/dosya diğerinde < 1 sn içinde görünüyor; bağlantı kopunca otomatik yeniden bağlanıyor.

### Faz 3 — Yayın Hazırlığı (≈ 5 g)

- [x] T3.1 Dockerfile'lar (multi-stage), production `docker-compose` / Fly.io config — 1 g
- [x] T3.2 Caddy/CDN, HTTPS, HSTS, CSP (`script-src 'self'`, `connect-src` sadece API/WS) — 0.5 g
- [x] T3.3 Gözlemlenebilirlik: Sentry, Prometheus metrikleri (aktif oda, clip sayısı, hata oranı), uptime izleme — 1 g
- [x] T3.4 Gizlilik politikası, kullanım şartları, abuse raporlama formu (KVKK/GDPR) — 0.5 g
- [x] T3.5 Erişilebilirlik denetimi (axe, Lighthouse), mobil testler — 0.5 g _(axe WCAG 2.1 AA, açık/koyu tema, masaüstü/mobil E2E; Lighthouse yapılmadı)_
- [x] T3.6 Yük testi (k6): 1000 eşzamanlı WS, 200 rps clip oluşturma — 0.5 g _(sonuçlar: docs/LOADTEST.md)_
- [x] T3.7 Güvenlik gözden geçirmesi: bağımlılık taraması (Dependabot, `pnpm audit`), OWASP kontrol listesi — 0.5 g
- [x] T3.8 SEO: ana sayfa meta etiketleri, OG görseli, sitemap — 0.5 g

### Faz 4 — v2 (opsiyonel, ≈ 10+ g)

- [x] T4.1 PWA (manifest, service worker, Web Share Target)
- [x] T4.2 i18n (TR/EN)
- [x] T4.3 CLI aracı (`clip put/get`)
- [x] T4.4 Tarayıcı eklentisi
- [ ] T4.5 Opsiyonel hesap + kalıcı cihaz eşleştirme (PostgreSQL) _(ertelendi: hesapsız kullanım ürünün temel vaadi)_
- [x] T4.6 ECDH tabanlı cihaz eşleştirme (daha güçlü E2E)
- [x] T4.7 WebRTC ile P2P büyük dosya aktarımı (sunucudan geçmeden) _(odada, 2 GB'a kadar; sinyaller oda anahtarıyla şifreli)_

**Toplam tahmin:** MVP ≈ 2 hafta, v1 ile yayın ≈ 5–6 hafta (tek geliştirici).

---

## 6. Güvenlik Kontrol Listesi

- [ ] Anahtar hiçbir zaman sunucuya gönderilmiyor (URL fragment); `Referrer-Policy: no-referrer`
- [ ] Şifre çözülen içerik `innerHTML` ile değil `textContent` ile basılıyor (XSS)
- [ ] Sıkı CSP; üçüncü parti script yok (analytics gerekiyorsa self-hosted, çerezsiz — ör. Plausible)
- [ ] Tüm girdilerde boyut ve şema doğrulama (REST + WS)
- [ ] Rate limit: oluşturma, okuma, kısa kod denemesi, WS mesajları
- [ ] Kısa kod brute-force koruması (deneme sayacı + kilit + kısa TTL)
- [ ] `deleteToken` sunucuda sadece hash olarak saklanıyor
- [ ] Burn-after-read atomik (yarış durumunda iki kez okunamaz)
- [ ] Link önizleme botlarının (Slack, WhatsApp) tek okumalık içeriği tüketmesini önlemek için "Göster" butonuna basmadan içerik çekilmiyor
- [ ] Loglarda içerik, anahtar veya tam IP yok
- [ ] Dosya indirmede `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`
- [ ] Redis ve S3 dış ağa kapalı, erişim bilgileri secret olarak yönetiliyor

---

## 7. Test Stratejisi

| Seviye      | Araç                                                            | Kapsam                                                                        |
| ----------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Birim       | Vitest                                                          | Kripto yardımcıları, ID üretici, şemalar, React bileşenleri (Testing Library) |
| Entegrasyon | Vitest + Supertest + gerçek Redis (Testcontainers / CI service) | REST uçları, TTL, burn, rate limit, WS oda akışı                              |
| E2E         | Playwright (Chromium, WebKit, mobil emülasyon)                  | Clip oluştur/aç, kodla alma, oda senaryosu (2 context), dosya yükleme         |
| Yük         | k6                                                              | REST throughput, WS eşzamanlılık                                              |
| Güvenlik    | OWASP ZAP baseline, `pnpm audit`                                | CI'da haftalık                                                                |

Hedef: backend ve `lib/crypto` için ≥ %80 satır kapsamı.

---

## 8. Dağıtım ve Maliyet (tahmini)

| Kalem             | Seçenek                                         | Aylık             |
| ----------------- | ----------------------------------------------- | ----------------- |
| Uygulama sunucusu | Fly.io 1 shared-cpu / Hetzner CX22              | $0–6              |
| Redis             | Upstash (free tier) / aynı VPS'te               | $0–10             |
| Dosya deposu      | Cloudflare R2 (10 GB ücretsiz, egress ücretsiz) | $0–2              |
| Frontend          | Cloudflare Pages                                | $0                |
| Alan adı          | .com / .app                                     | ~$1 (yıllık ~$12) |
| İzleme            | Sentry free, UptimeRobot free                   | $0                |
| **Toplam**        |                                                 | **≈ $0–20**       |

**Ortamlar:** `local` (docker-compose) → `staging` (PR preview) → `production` (main'e merge ile otomatik deploy).

---

## 9. Riskler ve Önlemler

| Risk                                                           | Etki   | Önlem                                                                                                          |
| -------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| Kötüye kullanım (malware, yasa dışı içerik dağıtımı)           | Yüksek | Kısa TTL, dosya boyut limiti, rate limit, abuse formu, gerekirse dosyalar için CAPTCHA                         |
| Kısa kodların tahmin edilmesi                                  | Orta   | Deneme sayacı, IP rate limit, kısa TTL, hassas veri için link/QR önerisi                                       |
| E2E nedeniyle sunucu tarafında içerik moderasyonu yapılamaması | Orta   | Bilinçli ürün kararı; şartlarda belirtilir, raporlanan link sahibi tarafından sağlanan anahtarla incelenebilir |
| WebSocket ölçekleme                                            | Orta   | Redis Pub/Sub, sticky session gerektirmeyen tasarım                                                            |
| Link önizleme botlarının burn içeriği tüketmesi                | Orta   | Açık "Göster" etkileşimi gerektirme                                                                            |
| Tarayıcı `navigator.clipboard` izin farklılıkları (iOS)        | Düşük  | Fallback: metni seçili hale getirip kullanıcıya kopyalatma                                                     |

---

## 10. Başarı Metrikleri

- Oluşturulan clip / gün, açılma oranı (açılan / oluşturulan)
- Ortalama "oluştur → açıl" süresi
- Aktif oda sayısı, oda başına ortalama cihaz
- Hata oranı < %1, p95 gecikme hedefleri
- (Çerezsiz, anonim metrikler)

---

## 11. Açık Kararlar

1. **Alan adı ve ürün adı** — "ClipBoard" jenerik; farklı bir marka adı düşünülebilir.
2. **Kısa kod uzunluğu** — 6 karakter (kolay) mı, 8 karakter (daha güvenli) mi?
3. **Dosya limiti** — 25 MB başlangıç; maliyete göre ayarlanabilir.
4. **Hesap sistemi** — Gerçekten gerekli mi, yoksa tamamen anonim mi kalacak?
5. **Barındırma** — Fly.io (yönetilen, kolay) vs. Hetzner VPS (ucuz, tam kontrol).

---

## 12. İlk Adım

Faz 0 görevleriyle başlanır (monorepo iskeleti + docker-compose + CI), ardından Faz 1'in kritik yolu: **T1.11 (kripto) → T1.4/T1.5 (API) → T1.12/T1.14 (UI) → T1.16 (E2E)**.
