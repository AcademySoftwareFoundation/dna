import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Spinner } from '@radix-ui/themes';
import {
  DESKTOP_AUTH_PAYLOAD_VERSION,
  DESKTOP_BRIDGE_READY_EVENT,
  deliverDesktopAuth,
  type DesktopAuthPayload,
} from '@dna/core';
import { useAuth, type AuthUser, type AuthProviderType } from '../contexts';
import { AuthCard, AuthFormSection } from './AuthCard';
import { SignInForm } from './SignInForm';

const Message = styled.p`
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-align: center;
  margin: 0;
`;

const Email = styled.strong`
  color: ${({ theme }) => theme.colors.text.primary};
`;

const SpinnerWrapper = styled.div`
  display: flex;
  justify-content: center;
  padding: 24px;
`;

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL || '/';
  return new URL(configured, window.location.origin)
    .toString()
    .replace(/\/+$/, '');
}

function buildPayload(
  token: string,
  user: AuthUser,
  authProvider: AuthProviderType
): DesktopAuthPayload {
  return {
    version: DESKTOP_AUTH_PAYLOAD_VERSION,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    },
    authProvider,
    apiBaseUrl: resolveApiBaseUrl(),
  };
}

export function DesktopSignIn() {
  const { isAuthenticated, isLoading, user, token, authProvider } = useAuth();
  const [delivered, setDelivered] = useState(false);
  const deliveredRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !user || !token) return;

    const tryDeliver = () => {
      if (deliveredRef.current) return;
      if (deliverDesktopAuth(buildPayload(token, user, authProvider))) {
        deliveredRef.current = true;
        setDelivered(true);
      }
    };

    tryDeliver();
    window.addEventListener(DESKTOP_BRIDGE_READY_EVENT, tryDeliver);
    return () =>
      window.removeEventListener(DESKTOP_BRIDGE_READY_EVENT, tryDeliver);
  }, [isAuthenticated, user, token, authProvider]);

  if (isLoading) {
    return (
      <AuthCard>
        <SpinnerWrapper>
          <Spinner size="3" />
        </SpinnerWrapper>
      </AuthCard>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <AuthCard>
        <SignInForm />
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthFormSection>
        <Message>
          Signed in as <Email>{user.email}</Email>
        </Message>
        {delivered ? (
          <Message>You can return to your desktop app.</Message>
        ) : (
          <Message>
            This page passes your DNA sign-in to a desktop app such as RV. No
            desktop app is connected.
          </Message>
        )}
      </AuthFormSection>
    </AuthCard>
  );
}
