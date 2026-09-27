import { DecryptionError, WrongPasswordError } from '@clipboard/shared';
import type { Translate } from '../i18n/core';
import { ApiError, NetworkError } from './api';
import { FileTooLargeError } from './clips';
import { RoomTextTooLargeError } from './rooms';

/** Hatayı kullanıcıya gösterilecek mesaja çevirir. */
export function describeError(error: unknown, t: Translate): string {
  if (error instanceof ApiError) {
    switch (error.body.error) {
      case 'not_found':
        return t('errors.notFound');
      case 'invalid_token':
        return error.body.remainingAttempts !== undefined
          ? t('errors.wrongCode', { n: error.body.remainingAttempts })
          : t('errors.invalidLink');
      case 'code_locked':
        return t('errors.codeLocked');
      case 'rate_limited':
        return t('errors.rateLimited');
      case 'file_missing':
        return t('errors.fileMissing');
      case 'invalid_request':
        return t('errors.invalidRequest');
      default:
        return t('errors.server');
    }
  }
  if (error instanceof NetworkError) return t('errors.network');
  if (error instanceof WrongPasswordError) return t('errors.wrongPassword');
  if (error instanceof FileTooLargeError) return t('errors.fileTooLarge');
  if (error instanceof RoomTextTooLargeError) return t('errors.roomTextTooLarge');
  if (error instanceof DecryptionError) return t('errors.decrypt');
  return t('errors.unexpected');
}
