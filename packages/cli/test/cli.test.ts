import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import { injectFetch } from '../../../apps/server/test/inject-fetch.js';
import { useTestApp } from '../../../apps/server/test/helpers.js';
import { run, safeName, type Io } from '../src/cli.js';

const ctx = useTestApp();
const dir = mkdtempSync(join(tmpdir(), 'clip-cli-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

async function clip(
  argv: string[],
  options: { stdin?: string; env?: Record<string, string>; answers?: string[] } = {},
): Promise<Result> {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  stdout.on('data', (chunk: Buffer) => out.push(chunk));
  stderr.on('data', (chunk: Buffer) => err.push(chunk));
  const stdin = Object.assign(
    options.stdin === undefined ? Readable.from([]) : Readable.from([options.stdin]),
    { isTTY: options.stdin === undefined },
  );
  const answers = options.answers;
  const io: Io = {
    stdin,
    stdout,
    stderr,
    env: { CLIPBOARD_SERVER: 'http://clip.test', ...options.env },
    prompt: answers ? async () => answers.shift() ?? '' : null,
    fetch: injectFetch(() => ctx.app),
    cwd: dir,
  };
  const code = await run(argv, io);
  return {
    code,
    stdout: Buffer.concat(out).toString(),
    stderr: Buffer.concat(err).toString(),
  };
}

const field = (output: string, name: string) =>
  new RegExp(`^${name}:\\s+(\\S+)`, 'm').exec(output)?.[1] ?? '';

describe('clip put / get', () => {
  it('shares piped text and opens it with the code', async () => {
    const put = await clip(['put'], { stdin: 'merhaba\nkomut satırı\n' });
    expect(put.code).toBe(0);
    const code = field(put.stdout, 'Code');
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);

    const get = await clip(['get', code]);
    expect(get).toMatchObject({ code: 0, stdout: 'merhaba\nkomut satırı\n' });
  });

  it('opens a link without --server (the link carries the server)', async () => {
    const put = await clip(['put', '--no-code', '--ttl', '7d'], { stdin: 'link' });
    expect(field(put.stdout, 'Code')).toBe('');
    const link = field(put.stdout, 'Link');
    const get = await clip(['get', link], { env: { CLIPBOARD_SERVER: 'http://wrong.test' } });
    expect(get.stdout).toBe('link');
  });

  it('shares a file and saves it under its own name', async () => {
    const source = join(dir, 'rapor.pdf');
    const bytes = Buffer.from(crypto.getRandomValues(new Uint8Array(4096)));
    writeFileSync(source, bytes);
    const put = await clip(['put', source, '--json']);
    const share = JSON.parse(put.stdout);
    expect(share.link).toContain('#k=');

    rmSync(source);
    const get = await clip(['get', share.code]);
    expect(get.code).toBe(0);
    expect(get.stderr).toContain('Saved rapor.pdf (4096 bytes)');
    expect(readFileSync(source)).toEqual(bytes);

    const again = await clip(['get', share.link]);
    expect(again.code).toBe(2);
    expect(again.stderr).toContain('already exists');
    expect((await clip(['get', share.link, '-o', 'kopya.pdf'])).code).toBe(0);
    expect(readFileSync(join(dir, 'kopya.pdf'))).toEqual(bytes);
  });

  it('protects with a password from the prompt or the environment', async () => {
    const put = await clip(['put', '--password'], {
      stdin: 'sır',
      env: { CLIPBOARD_PASSWORD: 'p1' },
    });
    expect(put.stdout).toContain('Password protected');
    expect(field(put.stdout, 'Code')).toBe('');
    const link = field(put.stdout, 'Link');

    const wrong = await clip(['get', link], { answers: ['a', 'b', 'c'] });
    expect(wrong).toMatchObject({ code: 1, stderr: 'clip: Wrong password.\n' });
    const right = await clip(['get', link], { answers: ['x', 'p1'] });
    expect(right.stdout).toBe('sır');
    const noPrompt = await clip(['get', link]);
    expect(noPrompt.stderr).toContain('CLIPBOARD_PASSWORD');
  });

  it('warns that burn-after-read shares are gone', async () => {
    const put = await clip(['put', '--burn'], { stdin: 'bir kez' });
    const code = field(put.stdout, 'Code');
    expect((await clip(['get', code])).stderr).toContain('deleted from the server');
    const second = await clip(['get', code]);
    expect(second).toMatchObject({ code: 1 });
    expect(second.stderr).toContain('Not found');
  });

  it('marks text as code', async () => {
    const put = await clip(['put', '--code', '--json'], { stdin: 'const a = 1;' });
    const { link } = JSON.parse(put.stdout);
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/clips/${new URL(link).pathname.split('/')[2]}`,
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('clip errors', () => {
  it('prints usage', async () => {
    expect((await clip(['--help'])).stdout).toContain('Usage:');
    expect((await clip([])).code).toBe(1);
    expect((await clip(['nope'])).code).toBe(2);
  });

  it('validates input', async () => {
    expect((await clip(['put'])).stderr).toContain('Nothing to share');
    expect((await clip(['put', '--ttl', '7d'], { stdin: 'x' })).stderr).toContain('--no-code');
    expect((await clip(['put', '--ttl', '2y'], { stdin: 'x' })).stderr).toContain('Invalid --ttl');
    expect((await clip(['get', 'merhaba'])).stderr).toContain('Not a share code or link');
    expect((await clip(['get'])).code).toBe(2);
  });

  it('reports wrong codes', async () => {
    const put = await clip(['put'], { stdin: 'x' });
    const [id, secret] = field(put.stdout, 'Code').split('-');
    const wrong = `${id}-${secret === 'AAAA' ? 'BBBB' : 'AAAA'}`;
    expect((await clip(['get', wrong])).stderr).toContain('Wrong code (4 attempts left)');
  });
});

describe('safeName', () => {
  it.each([
    ['rapor.pdf', 'rapor.pdf'],
    ['../../etc/passwd', 'passwd'],
    ['..\\..\\evil.exe', 'evil.exe'],
    ['..', 'download'],
    ['', 'download'],
  ])('%s → %s', (input, expected) => {
    expect(safeName(input)).toBe(expected);
  });
});
