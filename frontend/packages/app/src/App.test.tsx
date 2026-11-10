import { describe, it, expect, vi, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from './test/render';
import App from './App';
import { apiHandler } from './api';

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('should render the app', () => {
    render(<App />);
    expect(document.body).toBeInTheDocument();
  });

  it('should render the sign-in form initially', () => {
    render(<App />);
    expect(screen.getByText('Welcome to DNA')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });

  it('should show an error when sign-in fails', async () => {
    const login = vi.spyOn(apiHandler, 'login').mockRejectedValue({
      response: {
        status: 401,
        data: { detail: 'Invalid username or password' },
      },
    });
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('Username'), 'jdoe');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(login).toHaveBeenCalledWith('jdoe', 'wrong');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid username or password'
    );
  });
});
