import QRCode from 'qrcode';
import type { Share } from '@clipboard/shared';
import { msg } from './i18n';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function copyButton(text: string, testId: string) {
  const button = el('button', { type: 'button', className: 'secondary', textContent: msg('copy') });
  button.dataset.testid = testId;
  button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(text);
    button.textContent = msg('copied');
    setTimeout(() => (button.textContent = msg('copy')), 1500);
  });
  return button;
}

/** Kod, link, QR ve kopyalama butonlarını çizer. Tüm metinler `textContent` ile yazılır. */
export async function renderShare(container: HTMLElement, share: Share) {
  const code = el('output', { className: 'code', textContent: share.code ?? '' });
  code.dataset.testid = 'share-code';
  const link = el('input', { className: 'link', value: share.link, readOnly: true });
  link.dataset.testid = 'share-link';
  link.addEventListener('focus', () => link.select());
  const qr = el('img', {
    className: 'qr',
    alt: 'QR',
    src: await QRCode.toDataURL(share.link, { margin: 1, width: 160 }),
  });
  const expires = new Date(share.expiresAt).toLocaleString(chrome.i18n.getUILanguage());

  container.replaceChildren(
    ...(share.code
      ? [
          el('span', { className: 'label', textContent: msg('code') }),
          el('div', { className: 'row' }, [code, copyButton(share.code, 'copy-code')]),
        ]
      : []),
    el('span', { className: 'label', textContent: msg('link') }),
    el('div', { className: 'row' }, [link, copyButton(share.link, 'copy-link')]),
    qr,
    el('p', { className: 'muted', textContent: msg('expires', expires) }),
  );
}
