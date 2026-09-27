import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { createClipRequestSchema } from '@clipboard/shared';
import { mockFetch } from '../test/fetch-mock';
import { HomePage } from './HomePage';

afterEach(() => vi.unstubAllGlobals());

function renderHome() {
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe('HomePage', () => {
  it('encrypts the text before sending it and shows the share code', async () => {
    const requests = mockFetch((req) => {
      const body = JSON.parse(req.body!);
      return {
        status: 201,
        body: { id: body.id, deleteToken: 'D'.repeat(43), expiresAt: Date.now() + 3_600_000 },
      };
    });
    renderHome();

    await userEvent.type(screen.getByRole('textbox', { name: /metni/ }), 'çok gizli metin');
    await userEvent.click(screen.getByRole('button', { name: 'Şifrele ve paylaş' }));

    const code = await screen.findByTestId('share-code');
    expect(code.textContent).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);

    expect(requests).toHaveLength(1);
    const sent = createClipRequestSchema.parse(JSON.parse(requests[0]!.body!));
    expect(requests[0]!.body).not.toContain('gizli');
    expect(sent.ttl).toBe('1h');
    expect(sent.code).toBeDefined();
    expect(code.textContent!.startsWith(sent.id)).toBe(true);

    const link = screen.getByTestId('share-link') as HTMLInputElement;
    expect(link.value).toMatch(new RegExp(`/c/${sent.id}#k=[A-Za-z0-9_-]{43}$`));
    expect(requests[0]!.body).not.toContain(link.value.split('#k=')[1]);
  });

  it('limits the TTL when a short code is requested', async () => {
    renderHome();
    const sevenDays = screen.getByRole('radio', { name: '7 gün' });
    expect(sevenDays).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Kısa kod oluştur' }));
    expect(sevenDays).toBeEnabled();
    await userEvent.click(sevenDays);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Kısa kod oluştur' }));
    expect(screen.getByRole('radio', { name: '1 gün' })).toBeChecked();
  });

  it('disables the short code when a password is set', async () => {
    const requests = mockFetch((req) => ({
      status: 201,
      body: {
        id: JSON.parse(req.body!).id,
        deleteToken: 'D'.repeat(43),
        expiresAt: Date.now() + 3_600_000,
      },
    }));
    renderHome();
    await userEvent.type(screen.getByRole('textbox', { name: /metni/ }), 'x');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Parola ile koru' }));
    expect(screen.getByRole('checkbox', { name: 'Kısa kod oluştur' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Kısa kod oluştur' })).not.toBeChecked();

    const submit = screen.getByRole('button', { name: 'Şifrele ve paylaş' });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Parola'), 'gizli parola');
    await userEvent.click(submit);

    await screen.findByTestId('share-link');
    expect(screen.queryByTestId('share-code')).not.toBeInTheDocument();
    const sent = JSON.parse(requests[0]!.body!);
    expect(sent.passwordWrap).toBeDefined();
    expect(sent.code).toBeUndefined();
    expect(requests[0]!.body).not.toContain('gizli parola');
  });

  it('shows an error when the server is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    renderHome();
    await userEvent.type(screen.getByRole('textbox', { name: /metni/ }), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Şifrele ve paylaş' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya ulaşılamadı');
  });

  it('disables saving for empty text', () => {
    renderHome();
    expect(screen.getByRole('button', { name: 'Şifrele ve paylaş' })).toBeDisabled();
  });
});
