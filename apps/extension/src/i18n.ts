import { ClientApiError } from '@clipboard/shared';
import { TextTooLargeError } from './share';

export function msg(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

/** `data-i18n`, `data-i18n-placeholder` ve `data-i18n-title` özniteliklerini çevirir. */
export function localize(root: ParentNode = document) {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = msg(el.dataset.i18n!);
  }
  for (const el of root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    el.placeholder = msg(el.dataset.i18nPlaceholder!);
  }
  document.documentElement.lang = chrome.i18n.getUILanguage().split('-')[0] ?? 'en';
}

export function describeError(error: unknown): string {
  if (error instanceof TextTooLargeError) return msg('errorTooLarge');
  if (error instanceof TypeError) return msg('errorNetwork');
  if (error instanceof ClientApiError) return msg('errorGeneric', error.message);
  return msg('errorGeneric', error instanceof Error ? error.message : String(error));
}
