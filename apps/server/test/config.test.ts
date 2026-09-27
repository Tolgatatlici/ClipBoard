import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('development');
    expect(config.TRUST_PROXY).toBe(false);
  });

  it('coerces values', () => {
    expect(loadConfig({ PORT: '8080' }).PORT).toBe(8080);
    expect(loadConfig({ TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
  });

  it('parses ICE servers', () => {
    expect(loadConfig({}).RTC_ICE_SERVERS).toEqual([]);
    const servers = [{ urls: 'turn:turn.example.com', username: 'u', credential: 'p' }];
    expect(loadConfig({ RTC_ICE_SERVERS: JSON.stringify(servers) }).RTC_ICE_SERVERS).toEqual(
      servers,
    );
    expect(() => loadConfig({ RTC_ICE_SERVERS: 'nope' })).toThrow(/RTC_ICE_SERVERS/);
  });

  it('rejects invalid values', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ REDIS_URL: 'not a url' })).toThrow(/REDIS_URL/);
  });
});
