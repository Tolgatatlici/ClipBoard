import { parseShareTarget, type TtlOption } from '@clipboard/shared';
import { describeError, localize, msg } from './i18n';
import { getServer } from './settings';
import { createShare } from './share';
import { renderShare } from './ui';

localize();

const form = document.querySelector<HTMLFormElement>('#share-form')!;
const text = document.querySelector<HTMLTextAreaElement>('#text')!;
const ttl = document.querySelector<HTMLSelectElement>('#ttl')!;
const burn = document.querySelector<HTMLInputElement>('#burn')!;
const submit = document.querySelector<HTMLButtonElement>('#submit')!;
const error = document.querySelector<HTMLParagraphElement>('#error')!;
const result = document.querySelector<HTMLElement>('#result')!;
const resultBody = document.querySelector<HTMLElement>('#result-body')!;

document.querySelector('#use-page')!.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) text.value = tab.url;
  text.focus();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!text.value.trim()) return;
  submit.disabled = true;
  submit.textContent = msg('working');
  error.textContent = '';
  try {
    const share = await createShare({
      text: text.value,
      ttl: ttl.value as TtlOption,
      burnAfterRead: burn.checked,
    });
    await renderShare(resultBody, share);
    form.hidden = true;
    result.hidden = false;
  } catch (err) {
    error.textContent = describeError(err);
  } finally {
    submit.disabled = false;
    submit.textContent = msg('submit');
  }
});

document.querySelector('#new-share')!.addEventListener('click', () => {
  text.value = '';
  result.hidden = true;
  form.hidden = false;
  text.focus();
});

document.querySelector<HTMLFormElement>('#open-form')!.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector<HTMLInputElement>('#open-code')!;
  const target = parseShareTarget(input.value);
  if (!target || target.secret.kind !== 'code') {
    input.setCustomValidity(msg('codeLabel'));
    input.reportValidity();
    return;
  }
  // İçerik web uygulamasında çözülür; gizli kısım `#` sonrasında kalır.
  const server = await getServer();
  await chrome.tabs.create({ url: `${server}/c/${target.id}#s=${target.secret.value}` });
});

document.querySelector('#settings')!.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

text.focus();
