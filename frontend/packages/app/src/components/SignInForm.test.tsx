import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../test/render';
import { SignInForm } from './SignInForm';

describe('SignInForm', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('disables Continue until an email is entered', async () => {
    render(<SignInForm />);
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toBeDisabled();

    await userEvent.type(
      screen.getByPlaceholderText('you@example.com'),
      'artist@studio.com'
    );
    expect(button).toBeEnabled();
  });

  it('signs in with the trimmed email', async () => {
    render(<SignInForm />);
    await userEvent.type(
      screen.getByPlaceholderText('you@example.com'),
      '  artist@studio.com  '
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(localStorage.getItem('dna-auth-token')).toBe('artist@studio.com');
  });
});
