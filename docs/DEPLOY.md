# Yayına alma

Uygulama tek bir Docker imajıdır: API, WebSocket ve derlenmiş web arayüzü aynı Node
sürecinden sunulur. Önünde TLS için bir ters vekil (Caddy ya da platformun kendisi) ve
yanında Redis gerekir.

## Seçenek A — Tek sunucu (Docker Compose + Caddy)

Gereksinim: Docker kurulu bir Linux sunucu, alan adının A/AAAA kaydı bu sunucuyu göstermeli,
80 ve 443 portları açık.

```bash
git clone <depo> && cd clipboard/deploy
cp .env.prod.example .env.prod
# DOMAIN ve FILE_SIGNING_SECRET'ı doldurun: openssl rand -base64 48
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Caddy sertifikayı otomatik alır ve yeniler. Güncelleme: `git pull` ve aynı komut.

`.env.prod` içindeki `OPERATOR_NAME` ve `CONTACT_EMAIL`, yasal metinlerde görünen işletmeci
adı ve iletişim adresi olarak; `DOMAIN` ise canonical/Open Graph adresleri, `robots.txt` ve
`sitemap.xml` için derleme sırasında arayüze gömülür. Bunları değiştirdikten sonra `--build`
ile yeniden derleyin.

## Seçenek B — Fly.io

`fly.toml` depoda hazır. Birden fazla makine çalışabileceği için dosyalar S3 uyumlu bir
depolamada tutulmalıdır (ör. Cloudflare R2):

```bash
fly launch --no-deploy --copy-config
fly redis create                       # çıkan adres REDIS_URL olur
fly secrets set REDIS_URL=... CORS_ORIGIN=https://clip.example.com \
  STORAGE_DRIVER=s3 S3_ENDPOINT=https://<hesap>.r2.cloudflarestorage.com S3_REGION=auto \
  S3_BUCKET=clipboard-files S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=...
fly deploy --build-arg VITE_SITE_URL=https://clip.example.com \
  --build-arg VITE_OPERATOR_NAME="Örnek Ltd." --build-arg VITE_CONTACT_EMAIL=iletisim@clip.example.com
```

### R2 / S3 bucket CORS kuralı

Tarayıcı dosyaları doğrudan bucket'a yüklediği için gerekir:

```json
[
  {
    "AllowedOrigins": ["https://clip.example.com"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Uygulama dosyaları kendisi siler; bucket'ta ayrıca 8 günlük bir yaşam döngüsü kuralı
(lifecycle) tanımlamak, sunucu uzun süre kapalı kalırsa diye iyi bir güvencedir.

## İzleme

- **Uptime:** `GET /api/health` Redis'e ulaşılamazsa 503 döner; UptimeRobot vb. ile izleyin.
- **Metrikler:** `METRICS_TOKEN` tanımlanırsa `/metrics` Prometheus biçiminde açılır:

  ```yaml
  scrape_configs:
    - job_name: clipboard
      scheme: https
      authorization: { credentials: <METRICS_TOKEN> }
      static_configs: [{ targets: ['clip.example.com'] }]
  ```

  Başlıca metrikler: `clipboard_http_request_duration_seconds`, `clipboard_clips_created_total`,
  `clipboard_clip_opens_total{result="invalid|locked"}` (kod denemeleri),
  `clipboard_room_connections`, `clipboard_files_deleted_total`.

- **Hatalar:** `SENTRY_DSN` tanımlanırsa sunucu hataları, istek ayrıntıları çıkarılarak Sentry'ye
  gönderilir. Web arayüzünde bilinçli olarak hata izleme yoktur: sayfa adresleri
  şifre çözme anahtarlarını içerir.

## Moderasyon

Kötüye kullanım bildirimleri Redis'te 30 gün tutulur:

```bash
docker compose -f docker-compose.prod.yml exec app node dist/admin.js reports
docker compose -f docker-compose.prod.yml exec app node dist/admin.js delete-clip ABCD
```

Bildirimde tam link (`#k=` dahil) verilmişse içerik tarayıcıda açılıp incelenebilir.

## Yayın öncesi kontrol

- [ ] `DOMAIN`, `FILE_SIGNING_SECRET` (ya da S3 bilgileri) ayarlandı
- [ ] `VITE_SITE_URL`, `VITE_OPERATOR_NAME`, `VITE_CONTACT_EMAIL` ile derlendi
- [ ] Gizlilik politikası ve kullanım koşulları bir hukukçu tarafından gözden geçirildi
- [ ] `/api/health` izleniyor, (isteğe bağlı) metrikler toplanıyor
- [ ] S3 kullanılıyorsa bucket CORS kuralı eklendi
