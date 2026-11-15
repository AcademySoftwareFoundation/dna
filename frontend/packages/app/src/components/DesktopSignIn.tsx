import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import {
  DESKTOP_AUTH_PAYLOAD_VERSION,
  DESKTOP_BRIDGE_READY_EVENT,
  deliverDesktopAuth,
  type DesktopAuthPayload,
  type Playlist,
  type Project,
  type Session,
} from '@dna/core';
import { apiHandler } from '../api';
import { useAuth, type AuthUser, type AuthProviderType } from '../contexts';
import { useAddPlaylistToSession } from '../hooks/useSessions';
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

interface DesktopSelection {
  project: Project;
  playlist: Playlist;
  session: Session | null;
}

function buildPayload(
  token: string,
  user: AuthUser,
  authProvider: AuthProviderType,
  { project, playlist, session }: DesktopSelection
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
    ...(session && {
      session: { id: session.id, name: session.name ?? undefined },
    }),
  };
}

export function DesktopSignIn() {
  const { user, token, authProvider } = useAuth();
  const [delivered, setDelivered] = useState(false);
  const [selection, setSelection] = useState<DesktopSelection | null>(null);
  const deliveredRef = useRef(false);
  const resolvingRef = useRef(false);
  const addPlaylistToSession = useAddPlaylistToSession();

  // Resolve the DNA session the desktop app should drive, matching the web
  // app: in session mode, the picked session (with the playlist added to it);
  // in playlist mode, the playlist's implicit session. On failure the payload
  // goes without a session and the desktop app looks it up itself.
  const completeSelection = async (
    project: Project,
    playlist: Playlist,
    pickedSession?: Session
  ) => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    let session: Session | null = pickedSession ?? null;
    try {
      if (pickedSession) {
        await addPlaylistToSession.mutateAsync({
          sessionId: pickedSession.id,
          playlistId: playlist.id,
        });
      } else {
        session = await apiHandler.ensureSessionForPlaylist({
          projectId: project.id,
          playlistId: playlist.id,
        });
      }
    } catch {
      // Keep any picked session; otherwise deliver without one.
    }
    setSelection({ project, playlist, session });
  };

  useEffect(() => {
    if (!selection || !user || !token) return;

    const tryDeliver = () => {
      if (deliveredRef.current) return;
      if (
        deliverDesktopAuth(
          buildPayload(token, user, authProvider, selection)
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
      onSelectionComplete={(project, playlist, _email, session) => {
        void completeSelection(project, playlist, session);
      }}
    />
  );
}
