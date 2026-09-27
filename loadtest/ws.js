/**
 * Canlı oda yük testi: çok sayıda eşzamanlı WebSocket bağlantısı, odalara dağıtılmış.
 *   docker run --rm --network host -v "$PWD/loadtest:/scripts" grafana/k6 run \
 *     -e BASE_URL=http://localhost:3000 -e CONNECTIONS=1000 /scripts/ws.js
 * Her bağlantı birkaç saniyede bir şifreli (rastgele) öğe gönderir ve aynı odadaki
 * diğer bağlantılara ulaşmasını bekler. Oda başına en fazla 20 cihaz sınırı vardır.
 */
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { b64, WS_URL } from './lib.js';

const CONNECTIONS = Number(__ENV.CONNECTIONS || 1000);
const PER_ROOM = 10;
const HOLD_MS = Number(__ENV.HOLD_MS || 30000);
/** Bağlantılar bu süreye yayılır; 0 verilirse hepsi aynı anda bağlanır (ani yığılma). */
const RAMP_SECONDS = Number(__ENV.RAMP_SECONDS ?? 10);

const delivered = new Counter('room_items_delivered');
const deliveryLatency = new Trend('room_item_latency', true);

export const options = {
  scenarios: {
    rooms: {
      executor: 'per-vu-iterations',
      vus: CONNECTIONS,
      iterations: 1,
      maxDuration: '5m',
    },
  },
  thresholds: {
    ws_connecting: ['p(95)<500'],
    room_item_latency: ['p(95)<200'],
    checks: ['rate>0.99'],
  },
};

/** Oda kimliği: 16 bayt → 22 karakter base64url; VU'lar PER_ROOM'luk gruplara ayrılır. */
function roomIdFor(vu) {
  const group = String(Math.floor(vu / PER_ROOM)).padStart(6, '0');
  return `loadtestroom${group}xxxx`.slice(0, 22);
}

export default function () {
  sleep(((__VU - 1) / CONNECTIONS) * RAMP_SECONDS);
  const url = `${WS_URL}/ws/rooms/${roomIdFor(__VU)}`;
  const res = ws.connect(url, {}, (socket) => {
    socket.on('message', (raw) => {
      const message = JSON.parse(raw);
      if (message.type === 'item') {
        delivered.add(1);
        // ts sunucu zamanı; aynı makinede çalışırken gecikme için yeterli.
        deliveryLatency.add(Date.now() - message.item.ts);
      }
    });
    socket.setInterval(
      () => {
        socket.send(JSON.stringify({ type: 'item', item: { ct: b64(256), iv: b64(12) } }));
      },
      5000 + Math.random() * 1000,
    );
    socket.setTimeout(() => socket.close(), HOLD_MS);
  });
  check(res, { 'upgraded (101)': (r) => r && r.status === 101 });
}
