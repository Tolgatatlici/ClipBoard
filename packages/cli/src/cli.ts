import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import {
  ClientApiError,
  ClipboardClient,
  DecryptionError,
  LIMITS,
  MAX_SHORT_CODE_TTL,
  parseShareTarget,
  PasswordRequiredError,
  TTL_OPTIONS,
  WrongPasswordError,
  type Share,
  type TtlOption,
} from '@clipboard/shared';

export const DEFAULT_SERVER = 'http://localhost:3000';

export interface Io {
  stdin: Readable & { isTTY?: boolean };
  stdout: Writable & { isTTY?: boolean };
  stderr: Writable;
  env: Record<string, string | undefined>;
  /** Parola sorar (etkileşimli terminal yoksa `null`). */
  prompt: ((question: string) => Promise<string>) | null;
  fetch?: typeof fetch;
  cwd: string;
}

export const USAGE = `clip — end-to-end encrypted clipboard

Usage:
  clip put [file]          Share a file, or text piped on stdin
  clip get <code|link>     Open a share (text to stdout, files to disk)

Options for put:
  --ttl <5m|1h|1d|7d>      Delete after (default 1h; short codes at most 1d)
  --burn                   Delete after the first view
  --no-code                Link only: stronger than a short code, allows 7d
  --password               Protect with a password (prompted, or CLIPBOARD_PASSWORD)
  --code                   Mark text as source code (syntax highlighting)
  --text                   Share a file's contents as text instead of as a file
  --json                   Print the result as JSON

Options for get:
  -o, --output <path>      Where to save a file ("-" for stdout; default: its name)
  --force                  Overwrite an existing file

Global:
  --server <url>           Server address (default: $CLIPBOARD_SERVER or ${DEFAULT_SERVER})
  -h, --help               Show this help

Everything is encrypted before it leaves this machine; the server never sees the
content, the key or the password.
`;

class UsageError extends Error {}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

function formatExpiry(expiresAt: number) {
  const minutes = Math.round((expiresAt - Date.now()) / 60_000);
  const rel =
    minutes >= 1440
      ? `${Math.round(minutes / 1440)} d`
      : minutes >= 60
        ? `${Math.round(minutes / 60)} h`
        : `${minutes} min`;
  return `${new Date(expiresAt).toISOString()} (in ${rel})`;
}

async function getPassword(io: Io, question: string): Promise<string> {
  const fromEnv = io.env.CLIPBOARD_PASSWORD;
  if (fromEnv) return fromEnv;
  if (!io.prompt) {
    throw new UsageError('A password is required: set CLIPBOARD_PASSWORD or run in a terminal.');
  }
  return io.prompt(question);
}

async function put(args: string[], io: Io, server: string): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    allowNegative: true,
    options: {
      ttl: { type: 'string', default: '1h' },
      burn: { type: 'boolean', default: false },
      code: { type: 'boolean', default: false },
      text: { type: 'boolean', default: false },
      password: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      // `--no-code` kısa kodu kapatır; `--code` ise metni kod olarak işaretler.
      'short-code': { type: 'boolean', default: true },
    },
  });
  const ttl = values.ttl as TtlOption;
  if (!(ttl in TTL_OPTIONS)) throw new UsageError(`Invalid --ttl: ${values.ttl}`);
  const withCode = values['short-code'] && !values.password;
  if (withCode && TTL_OPTIONS[ttl] > TTL_OPTIONS[MAX_SHORT_CODE_TTL]) {
    throw new UsageError(
      `Short codes last at most ${MAX_SHORT_CODE_TTL}; add --no-code for ${ttl}.`,
    );
  }

  const [file] = positionals;
  let data: Buffer;
  let name = 'stdin.txt';
  if (file) {
    data = await readFile(file);
    name = basename(file);
  } else if (!io.stdin.isTTY) {
    data = await readAll(io.stdin);
  } else {
    throw new UsageError('Nothing to share: give a file or pipe text on stdin.');
  }
  const asText = !file || values.text;
  if (asText && data.length > LIMITS.maxTextBytes) {
    throw new UsageError(
      `Text is larger than ${LIMITS.maxTextBytes / 1024} KB; share it as a file instead.`,
    );
  }
  if (data.length > LIMITS.maxFileBytes) {
    throw new UsageError(`Files can be at most ${LIMITS.maxFileBytes / 1024 / 1024} MB.`);
  }

  const password = values.password ? await getPassword(io, 'Password: ') : undefined;
  const client = new ClipboardClient(server, io.fetch);
  const options = { ttl, burnAfterRead: values.burn, withCode, password };
  const share: Share = asText
    ? await client.shareText(data.toString('utf8'), {
        ...options,
        format: values.code ? 'code' : 'plain',
      })
    : await client.shareFile(new Uint8Array(data), { name, mime: mimeFor(name) }, options);

  if (values.json) {
    io.stdout.write(`${JSON.stringify(share)}\n`);
  } else {
    const lines = [
      share.code && `Code:    ${share.code}`,
      `Link:    ${share.link}`,
      `Expires: ${formatExpiry(share.expiresAt)}${values.burn ? ', or after the first view' : ''}`,
      password && 'Password protected: send the password separately from the link.',
    ];
    io.stdout.write(`${lines.filter(Boolean).join('\n')}\n`);
  }
  return 0;
}

async function get(args: string[], io: Io, serverOption: string | undefined): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' },
      force: { type: 'boolean', default: false },
    },
  });
  const [input] = positionals;
  if (!input) throw new UsageError('Give a share code or link: clip get ABCD-EFGH');
  const target = parseShareTarget(input);
  if (!target) throw new UsageError(`Not a share code or link: ${input}`);

  const server = serverOption ?? target.server ?? io.env.CLIPBOARD_SERVER ?? DEFAULT_SERVER;
  const client = new ClipboardClient(server, io.fetch);
  const opened = await client.open(target, {
    password: () => getPassword(io, 'Password: '),
  });
  if (opened.burnAfterRead)
    io.stderr.write('Note: this share has now been deleted from the server.\n');

  if (opened.content.kind === 'text') {
    const text = opened.content.text;
    if (values.output && values.output !== '-') {
      await writeSafely(resolveOutput(values.output, io), Buffer.from(text), values.force);
    } else {
      io.stdout.write(io.stdout.isTTY && !text.endsWith('\n') ? `${text}\n` : text);
    }
    return 0;
  }

  const data = Buffer.from(opened.file ?? new Uint8Array());
  if (values.output === '-') {
    io.stdout.write(data);
    return 0;
  }
  const path = resolveOutput(values.output ?? safeName(opened.content.name), io);
  await writeSafely(path, data, values.force);
  io.stderr.write(`Saved ${opened.content.name} (${data.length} bytes) to ${path}\n`);
  return 0;
}

/** Sunucudan gelen dosya adını yalnızca temel ada indirger (dizin geçişi olmasın). */
export function safeName(name: string): string {
  const base = [...basename(name.replace(/\\/g, '/'))]
    .filter((char) => char.charCodeAt(0) >= 0x20)
    .join('');
  return base && base !== '.' && base !== '..' ? base : 'download';
}

function resolveOutput(path: string, io: Io) {
  return path.startsWith('/') ? path : `${io.cwd}/${path}`;
}

async function writeSafely(path: string, data: Buffer, force: boolean) {
  if (!force && existsSync(path)) {
    throw new UsageError(`${path} already exists; use --force to overwrite or -o to choose.`);
  }
  await writeFile(path, data);
}

const MIME: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
};

function mimeFor(name: string) {
  return MIME[extname(name).toLowerCase()] ?? '';
}

function describe(err: unknown): string {
  if (err instanceof UsageError) return err.message;
  if (err instanceof ClientApiError) {
    switch (err.body.error) {
      case 'not_found':
        return 'Not found: the share expired, was deleted, or was view-once and already opened.';
      case 'invalid_token':
        return err.body.remainingAttempts !== undefined
          ? `Wrong code (${err.body.remainingAttempts} attempts left).`
          : 'Invalid link.';
      case 'code_locked':
        return 'Too many wrong codes; this share can only be opened with its link now.';
      case 'rate_limited':
        return 'Too many requests; try again in a minute.';
      default:
        return `Server error (${err.status}): ${err.message}`;
    }
  }
  if (err instanceof WrongPasswordError) return 'Wrong password.';
  if (err instanceof PasswordRequiredError) return 'This share is password protected.';
  if (err instanceof DecryptionError) return 'Could not decrypt: the link may be incomplete.';
  if (err instanceof TypeError && /fetch/i.test(err.message)) return 'Could not reach the server.';
  return err instanceof Error ? err.message : String(err);
}

export async function run(argv: string[], io: Io): Promise<number> {
  const [command, ...rest] = argv;
  // `--server` her yerde kabul edilir; alt komutlar onu görmez.
  let serverOption: string | undefined;
  const args: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--server') serverOption = rest[++i];
    else if (rest[i]!.startsWith('--server=')) serverOption = rest[i]!.slice('--server='.length);
    else args.push(rest[i]!);
  }
  // `--no-code` → `--no-short-code` (parseArgs olumsuz seçenekleri böyle bekler).
  const normalized = args.map((arg) => (arg === '--no-code' ? '--no-short-code' : arg));

  try {
    switch (command) {
      case 'put':
        return await put(normalized, io, serverOption ?? io.env.CLIPBOARD_SERVER ?? DEFAULT_SERVER);
      case 'get':
        return await get(normalized, io, serverOption);
      case undefined:
      case '-h':
      case '--help':
      case 'help':
        io.stdout.write(USAGE);
        return command === undefined ? 1 : 0;
      default:
        throw new UsageError(`Unknown command: ${command}\n\n${USAGE}`);
    }
  } catch (err) {
    io.stderr.write(`clip: ${describe(err)}\n`);
    return err instanceof UsageError ? 2 : 1;
  }
}
