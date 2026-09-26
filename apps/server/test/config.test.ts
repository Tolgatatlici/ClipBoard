import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('development');
  });

  it('coerces numeric values', () => {
    expect(loadConfig({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects invalid values', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ REDIS_URL: 'not a url' })).toThrow(/REDIS_URL/);
  });
});
