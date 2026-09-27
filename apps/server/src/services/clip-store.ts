import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { AccessMethod, CreateClipRequest, OpenClipResponse } from '@clipboard/shared';

/** Erişim anahtarları sunucuda yalnızca SHA-256 özeti olarak saklanır. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const key = (id: string) => `clip:${id}`;

// Yalnızca kimlik boşsa yazar (çakışmada 0 döner) ve TTL'i atomik olarak ayarlar.
const CREATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], unpack(ARGV, 2))
redis.call('EXPIRE', KEYS[1], ARGV[1])
return 1
`;

// Erişim anahtarını doğrular, kısa kod denemelerini sayar ve tek okumalık clip'leri
// okurken siler. Hepsi tek bir atomik adımda olduğundan aynı clip iki kez okunamaz.
const OPEN_SCRIPT = `
local k = KEYS[1]
local method, hash, maxAttempts = ARGV[1], ARGV[2], tonumber(ARGV[3])
if redis.call('EXISTS', k) == 0 then return {'not_found'} end
local expected = redis.call('HGET', k, method == 'code' and 'codeAuth' or 'linkAuth')
if not expected then return {'not_found'} end
if method == 'code' then
  local fails = tonumber(redis.call('HGET', k, 'fails') or '0')
  if fails >= maxAttempts then return {'locked'} end
  if expected ~= hash then
    fails = redis.call('HINCRBY', k, 'fails', 1)
    return {'invalid', tostring(maxAttempts - fails)}
  end
elseif expected ~= hash then
  return {'invalid'}
end
local d = redis.call('HMGET', k, 'kind', 'ct', 'iv', 'wk', 'wiv', 'burn', 'exp',
  'pws', 'pwk', 'pwiv', 'file')
if d[6] == '1' then redis.call('DEL', k) end
return {'ok', d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9], d[10], d[11]}
`;

// Silinen clip'in dosya kimliğini de döner ('' = dosya yok) ki dosya da silinebilsin.
const DELETE_SCRIPT = `
local d = redis.call('HMGET', KEYS[1], 'del', 'file')
if not d[1] then return {'not_found'} end
if d[1] ~= ARGV[1] then return {'forbidden'} end
redis.call('DEL', KEYS[1])
return {'deleted', d[2] or ''}
`;

type ScriptReply = (string | null)[];

interface ClipCommands {
  clipCreate(key: string, ttl: number, ...fields: string[]): Promise<number>;
  clipOpen(key: string, method: string, hash: string, maxAttempts: number): Promise<ScriptReply>;
  clipDelete(key: string, hash: string): Promise<ScriptReply>;
}

export interface NewClip extends CreateClipRequest {
  deleteToken: string;
  expiresAt: number;
}

export type OpenResult =
  | { status: 'ok'; clip: OpenClipResponse }
  | { status: 'not_found' }
  | { status: 'locked' }
  | { status: 'invalid'; remainingAttempts?: number };

export interface ClipMeta {
  expiresAt: number;
  burnAfterRead: boolean;
  hasCode: boolean;
  hasPassword: boolean;
}

export type DeleteResult =
  { status: 'deleted'; fileId: string | null } | { status: 'not_found' } | { status: 'forbidden' };

export class ClipStore {
  private readonly commands: ClipCommands;

  constructor(
    private readonly redis: Redis,
    private readonly maxCodeAttempts: number,
  ) {
    redis.defineCommand('clipCreate', { numberOfKeys: 1, lua: CREATE_SCRIPT });
    redis.defineCommand('clipOpen', { numberOfKeys: 1, lua: OPEN_SCRIPT });
    redis.defineCommand('clipDelete', { numberOfKeys: 1, lua: DELETE_SCRIPT });
    this.commands = redis as unknown as ClipCommands;
  }

  /** Clip'i kaydeder; kimlik zaten kullanılıyorsa `false` döner. */
  async create(clip: NewClip, ttlSeconds: number): Promise<boolean> {
    const fields: Record<string, string> = {
      kind: clip.kind,
      ct: clip.ciphertext,
      iv: clip.iv,
      linkAuth: hashToken(clip.linkToken),
      burn: clip.burnAfterRead ? '1' : '0',
      del: hashToken(clip.deleteToken),
      exp: String(clip.expiresAt),
    };
    if (clip.code) {
      fields.wk = clip.code.wrappedKey;
      fields.wiv = clip.code.wrapIv;
      fields.codeAuth = hashToken(clip.code.token);
    }
    if (clip.passwordWrap) {
      fields.pws = clip.passwordWrap.salt;
      fields.pwk = clip.passwordWrap.wrappedKey;
      fields.pwiv = clip.passwordWrap.wrapIv;
    }
    if (clip.fileId) fields.file = clip.fileId;
    const created = await this.commands.clipCreate(
      key(clip.id),
      ttlSeconds,
      ...Object.entries(fields).flat(),
    );
    return created === 1;
  }

  async meta(id: string): Promise<ClipMeta | null> {
    const [exp, burn, codeAuth, pws] = await this.redis.hmget(
      key(id),
      'exp',
      'burn',
      'codeAuth',
      'pws',
    );
    if (exp == null) return null;
    return {
      expiresAt: Number(exp),
      burnAfterRead: burn === '1',
      hasCode: codeAuth != null,
      hasPassword: pws != null,
    };
  }

  async open(id: string, method: AccessMethod, token: string): Promise<OpenResult> {
    const reply = await this.commands.clipOpen(
      key(id),
      method,
      hashToken(token),
      this.maxCodeAttempts,
    );
    switch (reply[0]) {
      case 'ok': {
        const [, kind, ciphertext, iv, wrappedKey, wrapIv, burn, exp, pws, pwk, pwiv, file] = reply;
        return {
          status: 'ok',
          clip: {
            kind: kind === 'file' ? 'file' : 'text',
            ciphertext: ciphertext!,
            iv: iv!,
            ...(wrappedKey && wrapIv ? { wrappedKey, wrapIv } : {}),
            ...(pws && pwk && pwiv
              ? { passwordWrap: { salt: pws, wrappedKey: pwk, wrapIv: pwiv } }
              : {}),
            ...(file ? { fileId: file } : {}),
            burnAfterRead: burn === '1',
            expiresAt: Number(exp),
          },
        };
      }
      case 'invalid':
        return reply[1] == null
          ? { status: 'invalid' }
          : { status: 'invalid', remainingAttempts: Math.max(0, Number(reply[1])) };
      case 'locked':
        return { status: 'locked' };
      default:
        return { status: 'not_found' };
    }
  }

  async delete(id: string, deleteToken: string): Promise<DeleteResult> {
    const [status, fileId] = await this.commands.clipDelete(key(id), hashToken(deleteToken));
    if (status === 'deleted') return { status, fileId: fileId || null };
    return { status: status === 'forbidden' ? 'forbidden' : 'not_found' };
  }
}
