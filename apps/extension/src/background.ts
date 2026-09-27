import { createShare, saveResult } from './share';
import { describeError, msg } from './i18n';

const MENU_ID = 'share-selection';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: msg('shareSelection'),
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_ID && info.selectionText) void shareSelection(info.selectionText);
});

/** Seçili metni paylaşır ve sonucu yeni bir sekmede gösterir. */
export async function shareSelection(text: string): Promise<void> {
  const key = crypto.randomUUID();
  try {
    const share = await createShare({ text, ttl: '1h', burnAfterRead: false });
    await saveResult(key, { ok: true, share });
  } catch (error) {
    await saveResult(key, { ok: false, error: describeError(error) });
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL(`result.html#${key}`) });
}
