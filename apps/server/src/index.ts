import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createRedis } from './services/redis.js';

const config = loadConfig();
const redis = createRedis(config.REDIS_URL);
const app = await buildApp(config, { redis });

async function shutdown(signal: NodeJS.Signals) {
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
    await redis.quit();
    process.exit(0);
  } catch (err) {
    app.log.error(err, 'error during shutdown');
    process.exit(1);
  }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
