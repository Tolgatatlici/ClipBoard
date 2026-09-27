import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrikleri. Etiketlerde yalnızca rota kalıpları ve sınırlı değer
 * kümeleri kullanılır; clip/oda kimliği, IP ya da içerik asla metriğe girmez.
 */
export function createMetrics() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'clipboard_process_' });

  return {
    registry,
    httpDuration: new Histogram({
      name: 'clipboard_http_request_duration_seconds',
      help: 'HTTP istek süresi',
      labelNames: ['method', 'route', 'status'] as const,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [registry],
    }),
    clipsCreated: new Counter({
      name: 'clipboard_clips_created_total',
      help: 'Oluşturulan clip sayısı',
      labelNames: ['kind', 'code', 'password', 'burn'] as const,
      registers: [registry],
    }),
    clipOpens: new Counter({
      name: 'clipboard_clip_opens_total',
      help: 'Clip açma denemeleri',
      labelNames: ['method', 'result'] as const,
      registers: [registry],
    }),
    filesCreated: new Counter({
      name: 'clipboard_files_created_total',
      help: 'Yükleme için açılan dosya sayısı',
      registers: [registry],
    }),
    filesDeleted: new Counter({
      name: 'clipboard_files_deleted_total',
      help: 'Temizlik sırasında silinen dosya sayısı',
      registers: [registry],
    }),
    roomConnections: new Gauge({
      name: 'clipboard_room_connections',
      help: 'Bu sunucu örneğine bağlı oda soketleri',
      registers: [registry],
    }),
    roomMessages: new Counter({
      name: 'clipboard_room_messages_total',
      help: 'Odalara gönderilen mesajlar',
      labelNames: ['type'] as const,
      registers: [registry],
    }),
  };
}

export type Metrics = ReturnType<typeof createMetrics>;
