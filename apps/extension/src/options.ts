import { localize, msg } from './i18n';
import { getServer, normalizeServer, setServer } from './settings';

localize();

const form = document.querySelector<HTMLFormElement>('#options-form')!;
const input = document.querySelector<HTMLInputElement>('#server')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;

input.value = await getServer();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const server = normalizeServer(input.value);
  if (!server) {
    status.textContent = msg('invalidServer');
    return;
  }
  input.value = server;
  status.textContent = (await setServer(server)) ? msg('saved') : msg('permissionDenied');
});
