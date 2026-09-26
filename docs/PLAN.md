# ClipBoard — Online Pano Uygulaması Proje Planı

> Referanslar: [codeshack.io/online-clipboard](https://codeshack.io/online-clipboard/) (metni kaydet → kısa kod al → başka cihazda kodla geri al) ve [copypaste.me](https://copypaste.me/) (iki cihazı ortak bir oda koduyla eşleştir, gerçek zamanlı ve uçtan uca şifreli metin/dosya aktar).
>
> Hedef: Bu iki modeli tek üründe birleştiren, **kayıt gerektirmeyen**, **uçtan uca şifreli**, **süreli (otomatik silinen)** ve **gerçek zamanlı** bir web panosu.

---

## 1. Ürün Vizyonu

Kullanıcı bir cihazda (ör. iş bilgisayarı) metin/dosya yapıştırır; başka bir cihazda (ör. telefon) kısa bir kod, QR kod veya link ile anında erişir. Sunucu içeriği **okuyamaz**, içerik belirlenen süre sonunda **kendiliğinden silinir**.

### 1.1 Kullanım Modları

| Mod | Açıklama | Referans |
|---|---|---|
| **Clip (Paylaşım)** | Metni/dosyayı yapıştır → "Kaydet" → 6 haneli kod + link + QR üret. Diğer cihaz kodu girip içeriği alır. Süre / tek okumalık / şifre seçenekleri. | codeshack |
| **Room (Canlı Oda)** | İki veya daha fazla cihaz aynı oda koduna bağlanır. Birinin yapıştırdığı her şey diğerlerinde anında görünür (WebSocket). | copypaste.me |

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

| Kategori | Gereksinim |
|---|---|
| **Güvenlik** | AES-256-GCM ile istemci tarafı şifreleme; anahtar URL fragment'ında (`#key`) taşınır, sunucuya gitmez. HTTPS zorunlu, HSTS, sıkı CSP. |
| **Gizlilik** | IP adresleri içerikle birlikte saklanmaz; loglar anonimleştirilir; KVKK/GDPR uyumlu gizlilik metni. |
| **Performans** | Kaydetme/okuma p95 < 300 ms; canlı odada mesaj gecikmesi p95 < 200 ms. |
| **Ölçeklenebilirlik** | Stateless API; WebSocket için Redis Pub/Sub ile yatay ölçekleme. |
| **Erişilebilirlik** | WCAG 2.1 AA; klavye ile tam kullanım; ekran okuyucu etiketleri. |
| **Uyumluluk** | Son 2 sürüm Chrome, Firefox, Safari, Edge; iOS Safari & Android Chrome. |
| **Kullanılabilirlik** | Kayıt yok; ilk ekranda tek adımda paylaşım; mobil öncelikli tasarım. |
| **Dayanıklılık** | %99.5 uptime hedefi; içerik geçici olduğu için yedekleme gereksiz, sadece konfigürasyon yedeklenir. |
| **Kötüye kullanım** | IP bazlı rate limit, boyut limitleri, CAPTCHA (şüpheli trafikte), rapor/abuse formu. |

---

## 3. Mimari

### 3.1 Önerilen Teknoloji Yığını

| Katman | Teknoloji | Neden |
|---|---|---|
| Frontend | **React + TypeScript + Vite**, Tailwind CSS, React Router | Hızlı, basit SPA; SSR gerekmiyor (içerik şifreli, SEO yalnızca ana sayfa için). |
| Kripto | **Web Crypto API** (AES-GCM, PBKDF2) | Tarayıcıda yerleşik, ek bağımlılık yok. |
| Backend | **Node.js 22 + Fastify + TypeScript** | Hafif, hızlı; `@fastify/websocket` ile WS desteği. |
| Gerçek zamanlı | **WebSocket** (`ws`) + **Redis Pub/Sub** | Çoklu instance arasında oda mesajlarını dağıtmak için. |
| Veri deposu | **Redis** (TTL'li anahtarlar) | Tüm içerik geçici → Redis'in `EXPIRE` özelliği otomatik silmeyi bedavaya verir. |
| Dosya deposu | **S3 uyumlu** (Cloudflare R2 / MinIO) + lifecycle kuralı | Şifreli blob'lar; presigned URL ile doğrudan yükleme. |
| Kalıcı DB (Faz 3) | PostgreSQL + Prisma/Drizzle | Sadece hesap özelliği eklenirse. |
| Doğrulama | **Zod** (frontend + backend ortak şema) | Tek kaynaktan tip güvenliği. |
| Test | Vitest, Supertest, Playwright | Birim, entegrasyon, E2E. |
| Monorepo | pnpm workspaces (`apps/web`, `apps/server`, `packages/shared`) | Ortak tipler ve şemalar. |
| Dağıtım | Docker; Fly.io / Railway / Hetzner VPS + Caddy; frontend Cloudflare Pages | WebSocket için kalıcı süreç gerekiyor (serverless uygun değil). |
| CI/CD | GitHub Actions | Lint, test, build, deploy. |
| Gözlemlenebilirlik | Pino log, Prometheus metrikleri / Grafana, Sentry | Hata ve performans takibi. |

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

**Clip modu:**
1. İstemci rastgele 256-bit anahtar (`K`) ve 96-bit IV üretir.
2. `ciphertext = AES-GCM(K, IV, plaintext)`.
3. `POST /api/clips` → `{ ciphertext, iv, ttl, burnAfterRead }` gönderilir. Sunucu `id` ve `deleteToken` döner.
4. Paylaşım linki: `https://clip.example.com/c/{id}#{base64url(K)}` — `#` sonrası sunucuya **asla** gitmez.
5. **Kısa kod ile erişim** (link yerine 6 haneli kod girilirse): anahtar URL'de olmadığı için anahtar koddan türetilir:
   - Kod = `id` (4 karakter) + `secret` (4–6 karakter). Sunucu yalnızca `id`'yi görür; `K = PBKDF2(secret, salt=id, 200k iterasyon)`.
   - Kısa kod entropisi düşük olduğundan: kısa süre (maks. 1 gün), sıkı rate limit (ör. IP başına 10 deneme/dk) ve `id` başına başarısız deneme sayacı (5 hatada içerik silinir) uygulanır. Kullanıcıya "hassas veri için link/QR kullanın" uyarısı gösterilir.
6. Parola seçeneği: `K = PBKDF2(parola, salt, 600k)`; salt ciphertext ile saklanır.

**Room modu:**
- Oda kodu (`ABCD-1234`) → `roomId = SHA-256(kod)[:16]`, `roomKey = HKDF(kod)`. Sunucu sadece `roomId` görür, mesajlar `roomKey` ile şifrelenir.
- Daha güçlü alternatif (v2): cihaz eşleştirmede ECDH (X25519) + QR ile açık anahtar değişimi.

### 3.4 Veri Modeli (Redis)

```
clip:{id}            HASH   { ct, iv, salt?, kind: text|file, mime?, size,
                              burn: 0|1, deleteTokenHash, createdAt, failedAttempts }
                     EXPIRE ttl
room:{roomId}:meta   HASH   { createdAt, lastActivity }        EXPIRE 24h (aktivitede yenilenir)
room:{roomId}:items  LIST   [ { ct, iv, kind, ts, senderId } ]  LTRIM 0..49, EXPIRE 24h
room:{roomId}:peers  SET    { connectionId... }                 (presence)
rl:{ip}:{route}      STRING sayaç                                EXPIRE 60s
file:{id}            → S3 objesi `files/{id}` (lifecycle: 7 gün)
```

**ID üretimi:** Karışabilen karakterler (0/O, 1/I/L) hariç Crockford Base32; `nanoid` ile çakışma kontrolü (`SET NX`).

### 3.5 REST API

| Metot | Yol | Açıklama |
|---|---|---|
| `POST` | `/api/clips` | Şifreli clip oluştur → `{ id, code, deleteToken, expiresAt }` |
| `GET` | `/api/clips/:id` | Şifreli clip getir (burn ise okuduktan sonra atomik sil – `GETDEL`/Lua) |
| `HEAD` | `/api/clips/:id` | Var mı / parola gerekli mi? (içerik döndürmeden) |
| `DELETE` | `/api/clips/:id` | `Authorization: Bearer {deleteToken}` ile sil |
| `POST` | `/api/files/presign` | Dosya yükleme için presigned PUT URL (boyut kontrolü) |
| `GET` | `/api/files/:id` | Presigned GET URL |
| `POST` | `/api/rooms` | Yeni oda kodu üret |
| `GET` | `/api/health` | Sağlık kontrolü |

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

| Rota | İçerik |
|---|---|
| `/` | Büyük metin alanı, "Kaydet" butonu, seçenekler (süre, tek okuma, parola), "Kod ile al" kutusu, "Canlı oda başlat" butonu |
| `/c/:id` | İçerik görüntüleme (şifre çözme, kopyala, indir, sil, kalan süre) |
| `/r/:code` | Canlı oda: öğe akışı, giriş alanı, dosya bırakma alanı, bağlı cihaz sayısı, QR |
| `/about`, `/privacy`, `/terms` | Nasıl çalışır, gizlilik, kullanım şartları |
| `/*` | 404 / "içerik süresi dolmuş" sayfası |

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
- [ ] T0.1 pnpm monorepo iskeleti (`apps/web`, `apps/server`, `packages/shared`) — 0.5 g
- [ ] T0.2 TypeScript, ESLint, Prettier, EditorConfig ortak ayarları — 0.25 g
- [ ] T0.3 `docker-compose.yml`: Redis + MinIO — 0.25 g
- [ ] T0.4 GitHub Actions CI: install → lint → typecheck → test → build — 0.5 g
- [ ] T0.5 Ortam değişkenleri (`.env.example`), config doğrulama (Zod) — 0.25 g
- [ ] T0.6 README: lokal kurulum ve çalıştırma — 0.25 g

### Faz 1 — MVP: Metin Clip (≈ 8–10 g)
**Backend**
- [ ] T1.1 Fastify sunucusu, health endpoint, Pino log, graceful shutdown — 0.5 g
- [ ] T1.2 Redis servisi ve bağlantı yönetimi — 0.25 g
- [ ] T1.3 ID/kod üretici (Crockford Base32, çakışma kontrolü) + testleri — 0.5 g
- [ ] T1.4 `POST /api/clips` (şema doğrulama, boyut limiti, TTL, deleteToken hash) — 1 g
- [ ] T1.5 `GET /api/clips/:id` + burn-after-read için atomik Lua script — 0.75 g
- [ ] T1.6 `DELETE /api/clips/:id` — 0.25 g
- [ ] T1.7 Kısa kod deneme sayacı ve brute-force koruması — 0.5 g
- [ ] T1.8 Rate limit (`@fastify/rate-limit` + Redis), CORS, güvenlik başlıkları (`@fastify/helmet`) — 0.5 g
- [ ] T1.9 Entegrasyon testleri (Supertest + test Redis) — 1 g

**Frontend**
- [ ] T1.10 Vite + React + Tailwind + Router kurulumu, layout, tema — 0.5 g
- [ ] T1.11 `lib/crypto.ts`: anahtar üretimi, AES-GCM encrypt/decrypt, PBKDF2, base64url + birim testleri — 1 g
- [ ] T1.12 Ana sayfa: editör, seçenekler paneli, kaydet akışı — 1 g
- [ ] T1.13 `ShareResult`: kod, link, QR (`qrcode` kütüphanesi), kopyala butonları — 0.5 g
- [ ] T1.14 `CodeInput` ile kodla alma ve `/c/:id` görüntüleme sayfası (geri sayım, kopyala, sil) — 1 g
- [ ] T1.15 Hata durumları: bulunamadı, süresi doldu, yanlış anahtar, ağ hatası — 0.5 g
- [ ] T1.16 Playwright E2E: oluştur → linkle aç → içerik eşleşir; burn sonrası 404 — 1 g

**Kabul kriteri:** Bir cihazda metin kaydedilip diğer cihazda kod/link/QR ile açılabiliyor; sunucu veritabanında yalnızca şifreli veri var; süre dolunca içerik yok.

### Faz 2 — v1: Canlı Oda + Dosya (≈ 10–12 g)
**Canlı oda**
- [ ] T2.1 `@fastify/websocket` entegrasyonu, bağlantı yaşam döngüsü, heartbeat — 1 g
- [ ] T2.2 Oda yönetimi: katılma, presence, geçmiş (Redis LIST), TTL yenileme — 1 g
- [ ] T2.3 Redis Pub/Sub ile çoklu instance yayını — 1 g
- [ ] T2.4 WS mesaj şeması doğrulama, mesaj rate limit, boyut limiti — 0.5 g
- [ ] T2.5 Frontend `lib/ws.ts`: bağlanma, exponential backoff ile yeniden bağlanma, kuyruk — 1 g
- [ ] T2.6 Oda sayfası: akış, giriş alanı, typing/presence göstergesi, QR ile davet — 1.5 g
- [ ] T2.7 Oda anahtarı türetme (HKDF) ve öğe şifreleme — 0.5 g

**Dosya paylaşımı**
- [ ] T2.8 S3/R2 servisi, presigned PUT/GET, lifecycle kuralı — 1 g
- [ ] T2.9 İstemci tarafında dosya şifreleme (büyük dosya için chunk'lı AES-GCM), yükleme ilerleme çubuğu — 1.5 g
- [ ] T2.10 DropZone + panodan görsel yapıştırma (`paste` event) + görsel önizleme — 1 g

**Diğer**
- [ ] T2.11 Parola koruması (UI + PBKDF2 akışı) — 0.5 g
- [ ] T2.12 Kod modu: söz dizimi vurgulama (Shiki / highlight.js, lazy load) — 0.5 g
- [ ] T2.13 Testler: WS entegrasyon testleri, iki tarayıcılı Playwright oda senaryosu — 1.5 g

**Kabul kriteri:** İki cihaz aynı odaya bağlandığında birinin gönderdiği metin/dosya diğerinde < 1 sn içinde görünüyor; bağlantı kopunca otomatik yeniden bağlanıyor.

### Faz 3 — Yayın Hazırlığı (≈ 5 g)
- [ ] T3.1 Dockerfile'lar (multi-stage), production `docker-compose` / Fly.io config — 1 g
- [ ] T3.2 Caddy/CDN, HTTPS, HSTS, CSP (`script-src 'self'`, `connect-src` sadece API/WS) — 0.5 g
- [ ] T3.3 Gözlemlenebilirlik: Sentry, Prometheus metrikleri (aktif oda, clip sayısı, hata oranı), uptime izleme — 1 g
- [ ] T3.4 Gizlilik politikası, kullanım şartları, abuse raporlama formu (KVKK/GDPR) — 0.5 g
- [ ] T3.5 Erişilebilirlik denetimi (axe, Lighthouse), mobil testler — 0.5 g
- [ ] T3.6 Yük testi (k6): 1000 eşzamanlı WS, 200 rps clip oluşturma — 0.5 g
- [ ] T3.7 Güvenlik gözden geçirmesi: bağımlılık taraması (Dependabot, `pnpm audit`), OWASP kontrol listesi — 0.5 g
- [ ] T3.8 SEO: ana sayfa meta etiketleri, OG görseli, sitemap — 0.5 g

### Faz 4 — v2 (opsiyonel, ≈ 10+ g)
- [ ] T4.1 PWA (manifest, service worker, Web Share Target)
- [ ] T4.2 i18n (TR/EN)
- [ ] T4.3 CLI aracı (`npx clipboard-cli put/get`)
- [ ] T4.4 Tarayıcı eklentisi
- [ ] T4.5 Opsiyonel hesap + kalıcı cihaz eşleştirme (PostgreSQL)
- [ ] T4.6 ECDH tabanlı cihaz eşleştirme (daha güçlü E2E)
- [ ] T4.7 WebRTC ile P2P büyük dosya aktarımı (sunucudan geçmeden)

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

| Seviye | Araç | Kapsam |
|---|---|---|
| Birim | Vitest | Kripto yardımcıları, ID üretici, şemalar, React bileşenleri (Testing Library) |
| Entegrasyon | Vitest + Supertest + gerçek Redis (Testcontainers / CI service) | REST uçları, TTL, burn, rate limit, WS oda akışı |
| E2E | Playwright (Chromium, WebKit, mobil emülasyon) | Clip oluştur/aç, kodla alma, oda senaryosu (2 context), dosya yükleme |
| Yük | k6 | REST throughput, WS eşzamanlılık |
| Güvenlik | OWASP ZAP baseline, `pnpm audit` | CI'da haftalık |

Hedef: backend ve `lib/crypto` için ≥ %80 satır kapsamı.

---

## 8. Dağıtım ve Maliyet (tahmini)

| Kalem | Seçenek | Aylık |
|---|---|---|
| Uygulama sunucusu | Fly.io 1 shared-cpu / Hetzner CX22 | $0–6 |
| Redis | Upstash (free tier) / aynı VPS'te | $0–10 |
| Dosya deposu | Cloudflare R2 (10 GB ücretsiz, egress ücretsiz) | $0–2 |
| Frontend | Cloudflare Pages | $0 |
| Alan adı | .com / .app | ~$1 (yıllık ~$12) |
| İzleme | Sentry free, UptimeRobot free | $0 |
| **Toplam** | | **≈ $0–20** |

**Ortamlar:** `local` (docker-compose) → `staging` (PR preview) → `production` (main'e merge ile otomatik deploy).

---

## 9. Riskler ve Önlemler

| Risk | Etki | Önlem |
|---|---|---|
| Kötüye kullanım (malware, yasa dışı içerik dağıtımı) | Yüksek | Kısa TTL, dosya boyut limiti, rate limit, abuse formu, gerekirse dosyalar için CAPTCHA |
| Kısa kodların tahmin edilmesi | Orta | Deneme sayacı, IP rate limit, kısa TTL, hassas veri için link/QR önerisi |
| E2E nedeniyle sunucu tarafında içerik moderasyonu yapılamaması | Orta | Bilinçli ürün kararı; şartlarda belirtilir, raporlanan link sahibi tarafından sağlanan anahtarla incelenebilir |
| WebSocket ölçekleme | Orta | Redis Pub/Sub, sticky session gerektirmeyen tasarım |
| Link önizleme botlarının burn içeriği tüketmesi | Orta | Açık "Göster" etkileşimi gerektirme |
| Tarayıcı `navigator.clipboard` izin farklılıkları (iOS) | Düşük | Fallback: metni seçili hale getirip kullanıcıya kopyalatma |

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
