import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from './App';

describe('AppRoutes', () => {
  it('renders the home page', () => {
    render(
      <MemoryRouter>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /ClipBoard/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Paylaşmak istediğiniz metni/)).toBeInTheDocument();
  });

  it('renders a 404 page for unknown routes', () => {
    render(
      <MemoryRouter initialEntries={['/nope']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Sayfa bulunamadı' })).toBeInTheDocument();
  });
});
