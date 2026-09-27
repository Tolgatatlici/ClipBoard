import { localize, msg } from './i18n';
import { takeResult } from './share';
import { renderShare } from './ui';

localize();

const body = document.querySelector<HTMLElement>('#result-body')!;
const result = await takeResult(location.hash.slice(1));

if (!result) {
  body.textContent = msg('resultMissing');
} else if (!result.ok) {
  body.replaceChildren(
    Object.assign(document.createElement('p'), { className: 'error', textContent: result.error }),
  );
} else {
  await renderShare(body, result.share);
}
