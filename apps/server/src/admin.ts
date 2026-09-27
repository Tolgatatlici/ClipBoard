/**
 * Moderasyon için komut satırı aracı (sunucuyla aynı ortam değişkenlerini kullanır):
 *
 *   node dist/admin.js reports [adet]     Son kötüye kullanım bildirimlerini listeler
 *   node dist/admin.js delete-clip <id>   Clip'i (ve dosyasını) hemen siler
 *
 * Docker'da: docker compose exec app node dist/admin.js reports
 */
import { loadConfig } from './config.js';
import { FileService } from './services/file-service.js';
import { ReportStore } from './services/report-store.js';
import { createRedis } from './services/redis.js';
import { createStorage } from './services/storage/index.js';

const [command, arg] = process.argv.slice(2);
const config = loadConfig();
const redis = createRedis(config.REDIS_URL);

try {
  switch (command) {
    case 'reports': {
      const reports = await new ReportStore(redis).list(Number(arg) || 50);
      if (reports.length === 0) console.log('Bildirim yok.');
      for (const report of reports) {
        console.log(
          [
            new Date(report.ts).toISOString(),
            report.reason,
            `clip=${report.clipId ?? '?'}`,
            report.target,
            report.details && `\n    ${report.details}`,
            report.contact && `\n    iletişim: ${report.contact}`,
          ]
            .filter(Boolean)
            .join('  '),
        );
      }
      break;
    }
    case 'delete-clip': {
      if (!arg) throw new Error('Kullanım: delete-clip <id>');
      const fileId = await redis.hget(`clip:${arg}`, 'file');
      const deleted = await redis.del(`clip:${arg}`);
      if (fileId) await new FileService(redis, createStorage(config)).deleteNow(fileId);
      console.log(
        deleted ? `Silindi: ${arg}${fileId ? ' (dosyasıyla birlikte)' : ''}` : 'Bulunamadı.',
      );
      break;
    }
    default:
      console.log('Komutlar: reports [adet] | delete-clip <id>');
      process.exitCode = 1;
  }
} finally {
  await redis.quit();
}
