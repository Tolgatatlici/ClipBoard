# Yük testi sonuçları

Tarih: 27 Eylül 2026 · Araç: [k6](https://k6.io) (`loadtest/`) · Hedef: üretim Docker imajı

**Ortam:** Uygulama konteyneri **1 CPU / 512 MB** ile sınırlandı (Fly.io `shared-cpu-1x`
ile karşılaştırılabilir), `NODE_ENV=production`, varsayılan günlük düzeyi (`info`). Redis ve
k6 aynı makinede çalıştı; ağ gecikmesi yok, bu yüzden sonuçlar sunucunun kendi işlem
kapasitesini gösterir. Tüm yük tek IP'den geldiği için istek sınırları yükseltildi.

## REST (`loadtest/http.js`)

Her yineleme bir paylaşım akışıdır: oluştur → meta → aç (3 istek, 1 KB şifreli içerik).

| Yük                | İstek/sn | p95 oluştur | p95 meta | p95 aç  | Hata |
| ------------------ | -------- | ----------- | -------- | ------- | ---- |
| 200 akış/sn, 60 sn | 600      | 4.6 ms      | 3.3 ms   | 3.5 ms  | %0   |
| 600 akış/sn, 45 sn | 1 797    | 18.4 ms     | 16.0 ms  | 15.8 ms | %0   |

Plan hedefi (200 istek/sn'de p95 < 300 ms) büyük bir payla karşılandı. Bellek kullanımı
~61 MB'ta kaldı.

## Canlı oda (`loadtest/ws.js`)

1 000 eşzamanlı WebSocket bağlantısı, 10'arlı 100 odaya dağıtılmış; her bağlantı 5–6 sn'de
bir 256 baytlık şifreli öğe gönderir, 30 sn açık kalır.

| Senaryo                       | Bağlantı p95 | Teslim gecikmesi p95 | Teslim edilen öğe | Başarı |
| ----------------------------- | ------------ | -------------------- | ----------------- | ------ |
| Bağlantılar 10 sn'ye yayılmış | 5.1 ms       | 3 ms                 | 49 883            | %100   |
| Hepsi aynı anda (ani yığılma) | 1.89 s       | 3 ms                 | 49 856            | %100   |

Ani yığılmada 1 000 el sıkışma aynı saniyede tek CPU'da sıraya girdiği için bağlantı kurma
süresi uzadı; bağlantıların hepsi kuruldu ve mesaj gecikmesi etkilenmedi. Bellek ~73 MB.

## Yeniden çalıştırma

```bash
# Sunucu (ayrı terminal): istek sınırları yükseltilmiş, 1 CPU
docker run --rm --network host --cpus 1 --memory 512m \
  -e PORT=3300 -e REDIS_URL=redis://127.0.0.1:6379/12 \
  -e RATE_LIMIT_MAX=1000000 -e RATE_LIMIT_CREATE_MAX=1000000 -e RATE_LIMIT_OPEN_MAX=1000000 \
  -e FILE_SIGNING_SECRET=$(openssl rand -base64 48) clipboard:local

docker run --rm --network host -v "$PWD/loadtest:/scripts" grafana/k6 run \
  -e BASE_URL=http://localhost:3300 -e RATE=200 -e DURATION=60s /scripts/http.js
docker run --rm --network host -v "$PWD/loadtest:/scripts" grafana/k6 run \
  -e BASE_URL=http://localhost:3300 -e CONNECTIONS=1000 /scripts/ws.js
```
