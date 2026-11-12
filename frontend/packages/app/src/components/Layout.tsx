import { useState, useEffect, type ReactNode } from 'react';
import styled from 'styled-components';
import type { Playlist, Version } from '@dna/core';
import { Sidebar } from './Sidebar';
import { AppHeader } from './AppHeader';

interface LayoutProps {
  children: ReactNode;
  playlistTabs?: ReactNode;
  onPlaylistChange?: (playlist: Playlist) => void;
  playlistId: string | null;
  sessionId?: string | null;
  projectId: string | null;
  selectedVersionId?: string | null;
  onVersionSelect?: (version: Version) => void;
  userEmail: string;
  onLogout?: () => void;
}

const COLLAPSE_BREAKPOINT = 1024;

const LayoutWrapper = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.bg.base};
`;

const Workspace = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
`;

const Main = styled.main`
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 24px 0 24px 32px;
  background:
    radial-gradient(
        ellipse 80% 50% at 50% -20%,
        ${({ theme }) => theme.colors.accent.subtle},
        transparent
      )
      fixed,
    ${({ theme }) => theme.colors.bg.base};
`;

export function Layout({
  children,
  playlistTabs,
  onPlaylistChange,
  playlistId,
  sessionId,
  projectId,
  selectedVersionId,
  onVersionSelect,
  userEmail,
  onLogout,
}: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.innerWidth < COLLAPSE_BREAKPOINT
  );

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < COLLAPSE_BREAKPOINT) {
        setSidebarCollapsed(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <LayoutWrapper>
      <AppHeader
        playlistTabs={playlistTabs}
        playlistId={playlistId}
        projectId={projectId}
        userEmail={userEmail}
        selectedVersionId={selectedVersionId}
        onLogout={onLogout}
      />
      <Workspace>
        <Sidebar
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          onPlaylistChange={onPlaylistChange}
          playlistId={playlistId}
          sessionId={sessionId}
          projectId={projectId}
          selectedVersionId={selectedVersionId}
          onVersionSelect={onVersionSelect}
          userEmail={userEmail}
        />
        <Main>{children}</Main>
      </Workspace>
    </LayoutWrapper>
  );
}
