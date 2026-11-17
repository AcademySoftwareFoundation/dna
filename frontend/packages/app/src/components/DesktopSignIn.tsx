import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import {
  DESKTOP_AUTH_PAYLOAD_VERSION,
  DESKTOP_BRIDGE_READY_EVENT,
  deliverDesktopAuth,
  type DesktopAuthPayload,
  type Playlist,
  type Project,
} from '@dna/core';
import { useAuth, type AuthUser, type AuthProviderType } from '../contexts';
import { AuthCard, AuthFormSection } from './AuthCard';
import { ProjectSelector } from './ProjectSelector';

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

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL || '/';
  return new URL(configured, window.location.origin)
    .toString()
    .replace(/\/+$/, '');
}

function buildPayload(
  token: string,
  user: AuthUser,
  authProvider: AuthProviderType,
  project: Project,
  playlist: Playlist
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
    project: {
      id: String(project.id),
      name: project.name,
    },
    playlist: {
      id: String(playlist.id),
      name: playlist.code,
    },
  };
}

export function DesktopSignIn() {
  const { user, token, authProvider } = useAuth();
  const [delivered, setDelivered] = useState(false);
  const [selection, setSelection] = useState<{
    project: Project;
    playlist: Playlist;
  } | null>(null);
  const deliveredRef = useRef(false);

  useEffect(() => {
    if (!selection || !user || !token) return;

    const tryDeliver = () => {
      if (deliveredRef.current) return;
      if (
        deliverDesktopAuth(
          buildPayload(token, user, authProvider, selection.project, selection.playlist)
        )
      ) {
        deliveredRef.current = true;
        setDelivered(true);
      }
    };

    tryDeliver();
    window.addEventListener(DESKTOP_BRIDGE_READY_EVENT, tryDeliver);
    return () =>
      window.removeEventListener(DESKTOP_BRIDGE_READY_EVENT, tryDeliver);
  }, [selection, user, token, authProvider]);

  if (delivered && user) {
    return (
      <AuthCard>
        <AuthFormSection>
          <Message>
            Signed in as <Email>{user.email}</Email>
          </Message>
          <Message>
            Playlist:{' '}
            <Email>
              {selection?.playlist.code || selection?.playlist.id}
            </Email>
          </Message>
          <Message>You can return to your desktop app.</Message>
        </AuthFormSection>
      </AuthCard>
    );
  }

  if (selection && user) {
    return (
      <AuthCard>
        <AuthFormSection>
          <Message>
            Signed in as <Email>{user.email}</Email>
          </Message>
          <Message>
            This page passes your DNA sign-in to a desktop app such as RV. No
            desktop app is connected.
          </Message>
        </AuthFormSection>
      </AuthCard>
    );
  }

  return (
    <ProjectSelector
      onSelectionComplete={(project, playlist) => {
        setSelection({ project, playlist });
      }}
    />
  );
}
