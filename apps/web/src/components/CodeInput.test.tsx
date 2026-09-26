import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatCodeInput } from '../lib/code-input';
import { CodeInput } from './CodeInput';

describe('formatCodeInput', () => {
  it.each([
    ['abcd', 'ABCD'],
    ['abcde', 'ABCD-E'],
    ['abcd-efgh', 'ABCD-EFGH'],
    ['ab cd ef gh ij', 'ABCD-EFGH'],
    ['oil0', '0110'],
  ])('%s → %s', (input, expected) => {
    expect(formatCodeInput(input)).toBe(expected);
  });
});

describe('CodeInput', () => {
  it('submits a parsed code', async () => {
    const onSubmit = vi.fn();
    render(<CodeInput onSubmit={onSubmit} />);
    const button = screen.getByRole('button', { name: 'Aç' });
    expect(button).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Paylaşım kodu'), 'k7p4qx9m');
    expect(screen.getByLabelText('Paylaşım kodu')).toHaveValue('K7P4-QX9M');
    await userEvent.click(button);
    expect(onSubmit).toHaveBeenCalledWith({ id: 'K7P4', secret: 'QX9M' });
  });
});
