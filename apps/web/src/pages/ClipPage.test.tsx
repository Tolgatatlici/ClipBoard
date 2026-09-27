import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import {
  encryptBlob,
  sealClip,
  type ClipContent,
  type SealedClip,
  type SealOptions,
} from '@clipboard/shared';
import { mockFetch } from '../test/fetch-mock';
import { ClipPage } from './ClipPage';

afterEach(() => vi.unstubAllGlobals());

const sealText = (text: string, options: SealOptions) =>
  sealClip({ kind: 'text', format: 'plain', text }, options);

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/c/:id" element={<ClipPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function serve(
  sealed: SealedClip,
  options: { burnAfterRead?: boolean; files?: Record<string, Uint8Array> } = {},
) {
  const burnAfterRead = options.burnAfterRead ?? false;
  const expiresAt = Date.now() + 3_600_000;
  return mockFetch((req) => {
    const fileMatch = /\/api\/files\/([^/]+)$/.exec(req.url);
    if (fileMatch) return { status: 200, body: { url: `/blob/${fileMatch[1]}` } };
    const blobMatch = /\/blob\/(.+)$/.exec(req.url);
    if (blobMatch) return { status: 200, raw: options.files?.[blobMatch[1]!] };
    if (req.method === 'GET') {
      return {
        status: 200,
        body: {
          expiresAt,
          burnAfterRead,
          hasCode: !!sealed.secret,
          hasPassword: !!sealed.request.passwordWrap,
        },
      };
    }
    const { method, token } = JSON.parse(req.body!);
    const expected = method === 'code' ? sealed.request.code?.token : sealed.request.linkToken;
    if (token !== expected) {
      return { status: 401, body: { error: 'invalid_token', remainingAttempts: 4 } };
    }
    return {
      status: 200,
      body: {
        kind: sealed.request.kind,
        ciphertext: sealed.request.ciphertext,
        iv: sealed.request.iv,
        wrappedKey: sealed.request.code?.wrappedKey,
        wrapIv: sealed.request.code?.wrapIv,
        passwordWrap: sealed.request.passwordWrap,
        fileId: sealed.request.fileId,
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
            body: {
              expiresAt: Date.now() + 1000,
              burnAfterRead: false,
              hasCode: false,
              hasPassword: false,
            },
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

  it('asks for the password and lets the user retry without refetching', async () => {
    const sealed = await sealText('parolalı içerik', { withCode: false, password: 'doğru' });
    const requests = serve(sealed, { burnAfterRead: true });
    renderAt(`/c/${sealed.id}#k=${sealed.key}`);

    expect(await screen.findByRole('heading', { name: 'Parola korumalı içerik' })).toBeVisible();
    expect(screen.getByText(/tek okumalıktır/)).toBeInTheDocument();
    expect(requests.filter((req) => req.method === 'POST')).toHaveLength(0);

    await userEvent.type(screen.getByLabelText('Parola'), 'yanlış');
    await userEvent.click(screen.getByRole('button', { name: 'Aç' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Parola yanlış');

    await userEvent.clear(screen.getByLabelText('Parola'));
    await userEvent.type(screen.getByLabelText('Parola'), 'doğru');
    await userEvent.click(screen.getByRole('button', { name: 'Aç' }));
    expect(await screen.findByTestId('clip-content')).toHaveTextContent('parolalı içerik');
    // Tek okumalık içerik yalnızca bir kez alındı.
    expect(requests.filter((req) => req.method === 'POST')).toHaveLength(1);
  });

  it('highlights code', async () => {
    const content: ClipContent = {
      kind: 'text',
      format: 'code',
      text: 'function merhaba(ad) {\n  return `Merhaba ${ad}`;\n}\n',
    };
    const sealed = await sealClip(content, { withCode: false });
    serve(sealed);
    renderAt(`/c/${sealed.id}#k=${sealed.key}`);

    expect(await screen.findByTestId('code-language')).toHaveTextContent('javascript');
    const pre = screen.getByTestId('clip-content');
    expect(pre.querySelector('.hljs-keyword')).toHaveTextContent('function');
    expect(pre).toHaveTextContent('function merhaba(ad)');
  });

  it('shows and decrypts a shared image', async () => {
    const data = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const fileId = 'F'.repeat(22);
    const sealed = await sealClip(
      { kind: 'file', name: 'ekran.png', mime: 'image/png', size: data.length },
      { withCode: false, fileId },
    );
    const blob = await encryptBlob(sealed.fileKey, data, fileId);
    serve(sealed, { files: { [fileId]: blob } });
    const created: Blob[] = [];
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (value: Blob) => {
        created.push(value);
        return 'blob:preview';
      },
      revokeObjectURL: () => undefined,
    });

    renderAt(`/c/${sealed.id}#k=${sealed.key}`);
    expect(await screen.findByTestId('file-name')).toHaveTextContent('ekran.png');
    expect(await screen.findByTestId('file-preview')).toHaveAttribute('src', 'blob:preview');
    expect(new Uint8Array(await created[0]!.arrayBuffer())).toEqual(data);
    expect(created[0]!.type).toBe('image/png');
  });
});
