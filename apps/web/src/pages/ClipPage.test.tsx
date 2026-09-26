import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { sealText, type SealedClip } from '@clipboard/shared';
import { mockFetch } from '../test/fetch-mock';
import { ClipPage } from './ClipPage';

afterEach(() => vi.unstubAllGlobals());

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/c/:id" element={<ClipPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function serve(sealed: SealedClip, options: { burnAfterRead?: boolean } = {}) {
  const burnAfterRead = options.burnAfterRead ?? false;
  const expiresAt = Date.now() + 3_600_000;
  return mockFetch((req) => {
    if (req.method === 'GET') {
      return { status: 200, body: { expiresAt, burnAfterRead, hasCode: !!sealed.secret } };
    }
    const { method, token } = JSON.parse(req.body!);
    const expected = method === 'code' ? sealed.request.code?.token : sealed.request.linkToken;
    if (token !== expected) {
      return { status: 401, body: { error: 'invalid_token', remainingAttempts: 4 } };
    }
    return {
      status: 200,
      body: {
        kind: 'text',
        ciphertext: sealed.request.ciphertext,
        iv: sealed.request.iv,
        wrappedKey: sealed.request.code?.wrappedKey,
        wrapIv: sealed.request.code?.wrapIv,
        burnAfterRead,
        expiresAt,
      },
    };
  });
}

describe('ClipPage', () => {
  it('decrypts a clip opened with a link', async () => {
    const sealed = await sealText('merhaba dünya <script>', { withCode: false });
    const requests = serve(sealed);
    renderAt(`/c/${sealed.id}#k=${sealed.key}`);

    expect(await screen.findByTestId('clip-content')).toHaveTextContent('merhaba dünya <script>');
    for (const req of requests) {
      expect(req.url).not.toContain(sealed.key);
      expect(req.body ?? '').not.toContain(sealed.key);
    }
  });

  it('decrypts a clip opened with a short code', async () => {
    const sealed = await sealText('kodla', { withCode: true });
    serve(sealed);
    renderAt(`/c/${sealed.id}#s=${sealed.secret}`);
    expect(await screen.findByTestId('clip-content')).toHaveTextContent('kodla');
  });

  it('asks for confirmation before opening a burn-after-read clip', async () => {
    const sealed = await sealText('bir kez', { withCode: false });
    const requests = serve(sealed, { burnAfterRead: true });
    renderAt(`/c/${sealed.id}#k=${sealed.key}`);

    const button = await screen.findByRole('button', { name: 'İçeriği göster' });
    expect(requests.filter((req) => req.method === 'POST')).toHaveLength(0);
    await userEvent.click(button);
    expect(await screen.findByTestId('clip-content')).toHaveTextContent('bir kez');
    expect(requests.filter((req) => req.method === 'POST')).toHaveLength(1);
  });

  it('lets the user retry after a wrong code', async () => {
    const sealed = await sealText('x', { withCode: true });
    serve(sealed);
    const wrong = sealed.secret === 'AAAA' ? 'BBBB' : 'AAAA';
    renderAt(`/c/${sealed.id}#s=${wrong}`);

    expect(await screen.findByRole('alert')).toHaveTextContent('Kalan deneme hakkı: 4');
    expect(screen.getByLabelText('Paylaşım kodu')).toBeInTheDocument();
  });

  it('asks for the code when a short link has no secret', async () => {
    renderAt('/c/ABCD');
    expect(await screen.findByRole('heading', { name: 'Kodu girin' })).toBeInTheDocument();
  });

  it('reports a missing key for long links', async () => {
    renderAt('/c/ABCDEFGHJKMN');
    expect(await screen.findByRole('heading', { name: 'Link eksik' })).toBeInTheDocument();
  });

  it('shows a not-found message for expired clips', async () => {
    mockFetch(() => ({ status: 404, body: { error: 'not_found' } }));
    renderAt('/c/ABCDEFGHJKMN#k=' + 'A'.repeat(43));
    expect(await screen.findByRole('alert')).toHaveTextContent('İçerik bulunamadı');
  });

  it('shows a decryption error for a corrupted key', async () => {
    const sealed = await sealText('x', { withCode: false });
    const other = await sealText('y', { withCode: false });
    mockFetch((req) =>
      req.method === 'GET'
        ? {
            status: 200,
            body: { expiresAt: Date.now() + 1000, burnAfterRead: false, hasCode: false },
          }
        : {
            status: 200,
            body: {
              kind: 'text',
              ciphertext: sealed.request.ciphertext,
              iv: sealed.request.iv,
              burnAfterRead: false,
              expiresAt: Date.now() + 1000,
            },
          },
    );
    renderAt(`/c/${sealed.id}#k=${other.key}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('İçerik çözülemedi');
  });
});
