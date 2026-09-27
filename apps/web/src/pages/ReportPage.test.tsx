import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { mockFetch } from '../test/fetch-mock';
import { ReportPage } from './ReportPage';

afterEach(() => vi.unstubAllGlobals());

describe('ReportPage', () => {
  it('sends a report', async () => {
    const requests = mockFetch(() => ({ status: 202, body: { status: 'received' } }));
    render(
      <MemoryRouter>
        <ReportPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText('Link ya da kod'), 'https://x.test/c/ABCD');
    await userEvent.selectOptions(screen.getByLabelText('Neden'), 'phishing');
    await userEvent.type(screen.getByLabelText(/Açıklama/), 'sahte giriş sayfası');
    await userEvent.click(screen.getByRole('button', { name: 'Bildir' }));

    expect(await screen.findByRole('heading', { name: 'Bildiriminiz alındı' })).toBeVisible();
    expect(requests[0]!.url).toBe('/api/reports');
    expect(JSON.parse(requests[0]!.body!)).toEqual({
      target: 'https://x.test/c/ABCD',
      reason: 'phishing',
      details: 'sahte giriş sayfası',
      contact: '',
    });
  });
});
