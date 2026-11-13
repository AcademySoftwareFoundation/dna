import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../test/render';

const login = vi.fn();

vi.mock('../api', () => ({
  apiHandler: {
    setUser: vi.fn(),
    setAuthRefreshHandler: vi.fn(),
    login: (...args: unknown[]) => login(...args),
    refreshAuth: vi.fn(),
  },
}));

vi.mock('../contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../contexts/AuthContext')>(
    '../contexts/AuthContext'
  );
  return {
    ...actual,
    useAuth: () => ({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      token: null,
      authProvider: 'shotgrid' as const,
      signIn: vi.fn(),
      signInWithEmail: vi.fn(),
      signInWithPassword: async (username: string, password: string) => {
        const session = await login(username, password);
        return session;
      },
      signOut: vi.fn(),
    }),
  };
});

import { SignInForm } from './SignInForm';

describe('SignInForm shotgrid', () => {
  beforeEach(() => {
    login.mockReset();
    login.mockResolvedValue({
      token: 'access',
      refresh_token: 'refresh',
      principal: {
        email: 'artist@studio.com',
        login: 'artist',
        provider: 'shotgrid',
      },
    });
  });

  it('submits username and password to login', async () => {
    render(<SignInForm />);
    await userEvent.type(
      screen.getByPlaceholderText('legacy login'),
      'artist'
    );
    await userEvent.type(
      screen.getByPlaceholderText('legacy password'),
      'secret'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith('artist', 'secret')
    );
  });

  it('shows a login error when credentials are invalid', async () => {
    login.mockRejectedValue({
      response: {
        data: { detail: "Can't authenticate user 'artist'." },
      },
    });
    render(<SignInForm />);
    await userEvent.type(
      screen.getByPlaceholderText('legacy login'),
      'artist'
    );
    await userEvent.type(
      screen.getByPlaceholderText('legacy password'),
      'wrong'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Can't authenticate user 'artist'/i
    );
  });

  it('shows a fallback login error when the API detail is missing', async () => {
    login.mockRejectedValue({
      response: { data: {} },
      message: 'Request failed with status code 401',
    });
    render(<SignInForm />);
    await userEvent.type(
      screen.getByPlaceholderText('legacy login'),
      'artist'
    );
    await userEvent.type(
      screen.getByPlaceholderText('legacy password'),
      'wrong'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Invalid username or password/i
    );
  });

  it('links to Flow account setup docs', () => {
    render(<SignInForm />);
    const link = screen.getByRole('link', {
      name: /Flow Account Setup/i,
    });
    expect(link).toHaveAttribute(
      'href',
      'https://academysoftwarefoundation.github.io/dna/docs/2-account-setup'
    );
    expect(link).toHaveAttribute('target', '_blank');
  });
});
