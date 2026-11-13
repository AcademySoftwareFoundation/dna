import { useState } from 'react';
import styled from 'styled-components';
import { useAuth } from '../contexts';
import { AuthFormSection, AuthLabel } from './AuthCard';

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const StyledInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 12px 16px;
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 15px;
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  outline: none;
  transition: all ${({ theme }) => theme.transitions.fast};

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.muted};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.accent.main};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.accent.subtle};
  }
`;

const SubmitButton = styled.button`
  width: 100%;
  box-sizing: border-box;
  padding: 12px 24px;
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 15px;
  font-weight: 500;
  color: white;
  background: ${({ theme }) => theme.colors.accent.main};
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.accent.hover};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const GoogleButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  padding: 12px 24px;
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 15px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    border-color: ${({ theme }) => theme.colors.border.default};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path
      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      fill="#4285F4"
    />
    <path
      d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
      fill="#34A853"
    />
    <path
      d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      fill="#FBBC05"
    />
    <path
      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      fill="#EA4335"
    />
  </svg>
);

const ErrorBanner = styled.p`
  margin: 0;
  padding: 10px 12px;
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 13px;
  line-height: 1.4;
  color: ${({ theme }) => theme.colors.status.error};
  background: rgba(239, 68, 68, 0.1);
  border-radius: ${({ theme }) => theme.radii.md};
`;

const HelpText = styled.p`
  margin: 0;
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 12px;
  line-height: 1.45;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const HelpLink = styled.a`
  color: ${({ theme }) => theme.colors.accent.main};
  text-decoration: underline;
  text-underline-offset: 2px;

  &:hover {
    color: ${({ theme }) => theme.colors.accent.hover};
  }
`;

const SHOTGRID_LEGACY_LOGIN_DOCS_URL =
  'https://academysoftwarefoundation.github.io/dna/docs/2-account-setup';

function extractLoginErrorDetail(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const response = (err as { response?: { data?: { detail?: unknown } } })
    .response;
  const detail = response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }
  if (err instanceof Error && err.message.trim()) {
    // Prefer API detail over generic axios / mismatch messages when present.
    if (!err.message.startsWith('Request failed')) {
      return err.message.trim();
    }
  }
  return null;
}

export function SignInForm() {
  const {
    authProvider,
    isLoading,
    signIn,
    signInWithEmail,
    signInWithPassword,
  } = useAuth();
  const [emailInput, setEmailInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  switch (authProvider) {
    case 'none':
      return (
        <AuthFormSection>
          <StyledForm
            onSubmit={(e) => {
              e.preventDefault();
              if (emailInput.trim()) {
                signInWithEmail(emailInput.trim());
              }
            }}
          >
            <AuthLabel>Enter your email</AuthLabel>
            <StyledInput
              type="email"
              placeholder="you@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              autoFocus
            />
            <SubmitButton type="submit" disabled={!emailInput.trim()}>
              Continue
            </SubmitButton>
          </StyledForm>
        </AuthFormSection>
      );
    case 'google':
      return (
        <AuthFormSection>
          <GoogleButton onClick={signIn} disabled={isLoading}>
            <GoogleIcon />
            Sign in with Google
          </GoogleButton>
        </AuthFormSection>
      );
    case 'shotgrid':
      return (
        <AuthFormSection>
          <StyledForm
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              try {
                await signInWithPassword(
                  usernameInput.trim(),
                  passwordInput
                );
              } catch (err) {
                const detail = extractLoginErrorDetail(err);
                setError(
                  detail ||
                    'Invalid username or password. Use your Flow legacy login and legacy password, not your Autodesk Account password.'
                );
              }
            }}
          >
            {error ? (
              <ErrorBanner role="alert">{error}</ErrorBanner>
            ) : null}
            <AuthLabel>ShotGrid username</AuthLabel>
            <StyledInput
              type="text"
              placeholder="legacy login"
              value={usernameInput}
              onChange={(e) => {
                setError(null);
                setUsernameInput(e.target.value);
              }}
              autoFocus
              autoComplete="username"
              aria-invalid={error ? true : undefined}
            />
            <AuthLabel>Password</AuthLabel>
            <StyledInput
              type="password"
              placeholder="legacy password"
              value={passwordInput}
              onChange={(e) => {
                setError(null);
                setPasswordInput(e.target.value);
              }}
              autoComplete="current-password"
              aria-invalid={error ? true : undefined}
            />
            <SubmitButton
              type="submit"
              disabled={
                isLoading || !usernameInput.trim() || !passwordInput
              }
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
            </SubmitButton>
            <HelpText>
              Need to enable legacy login?{' '}
              <HelpLink
                href={SHOTGRID_LEGACY_LOGIN_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Flow Account Setup
              </HelpLink>
            </HelpText>
          </StyledForm>
        </AuthFormSection>
      );
    default: {
      const unhandled: never = authProvider;
      throw new Error(`Unhandled auth provider: ${unhandled}`);
    }
  }
}
