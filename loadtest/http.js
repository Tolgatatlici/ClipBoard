/**
 * REST yük testi: clip oluşturma + meta + açma.
 *   docker run --rm --network host -v "$PWD/loadtest:/scripts" grafana/k6 run \
 *     -e BASE_URL=http://localhost:3000 /scripts/http.js
 * Hedef sunucuda istek sınırları yükseltilmelidir (tek IP'den yük gelir):
 *   RATE_LIMIT_MAX / RATE_LIMIT_CREATE_MAX / RATE_LIMIT_OPEN_MAX
 */
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, fakeClip } from './lib.js';

const RATE = Number(__ENV.RATE || 200);

export const options = {
  scenarios: {
    share: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: __ENV.DURATION || '60s',
      preAllocatedVUs: 50,
      maxVUs: 500,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:create}': ['p(95)<300'],
    'http_req_duration{name:open}': ['p(95)<300'],
    'http_req_duration{name:meta}': ['p(95)<300'],
  },
};

const json = { headers: { 'Content-Type': 'application/json' } };

export default function () {
  const clip = fakeClip();
  const created = http.post(`${BASE_URL}/api/clips`, JSON.stringify(clip), {
    ...json,
    tags: { name: 'create' },
  });
  check(created, { 'created 201': (r) => r.status === 201 });

  const meta = http.get(`${BASE_URL}/api/clips/${clip.id}`, { tags: { name: 'meta' } });
  check(meta, { 'meta 200': (r) => r.status === 200 });

  const opened = http.post(
    `${BASE_URL}/api/clips/${clip.id}/open`,
    JSON.stringify({ method: 'link', token: clip.linkToken }),
    { ...json, tags: { name: 'open' } },
  );
  check(opened, { 'open 200': (r) => r.status === 200 });
}
