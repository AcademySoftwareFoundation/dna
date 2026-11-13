import { useState, useEffect, type ReactNode } from 'react';
import styled from 'styled-components';
import type { Version } from '@dna/core';
import { Sidebar } from './Sidebar';
import { AppHeader, type HeaderContextMode } from './AppHeader';
import type { RecentSessionEntry } from '../recentSessions';

interface LayoutProps {
  children: ReactNode;
  playlistTabs?: ReactNode;
  contextName?: string | null;
  contextMode?: HeaderContextMode | null;
  currentContextId?: string | null;
  changeContextLabel?: string | null;
  onChangeContext?: () => void;
  onSelectRecentContext?: (entry: RecentSessionEntry) => void;
  playlistId: string | null;
  sessionId?: string | null;
  projectId: string | null;
  selectedVersionId?: string | null;
  onVersionSelect?: (version: Version) => void;
  userEmail: string;
  onLogout?: () => void;
}

const COLLAPSE_BREAKPOINT = 1024;

/**
 * The narrowest the app lays out. Below this the header's fixed parts (logo,
 * session name, add-playlist, Publish, avatar) no longer fit beside each
 * other, so the page scrolls sideways instead of squeezing them together.
 * Leaves about 100px of playlist tabs with the longest session name.
 */
const MIN_APP_WIDTH = '760px';

const LayoutWrapper = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: ${MIN_APP_WIDTH};
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
  contextName,
  contextMode,
  currentContextId,
  changeContextLabel,
  onChangeContext,
  onSelectRecentContext,
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
        contextName={contextName}
        contextMode={contextMode}
        currentContextId={currentContextId}
        changeContextLabel={changeContextLabel}
        onChangeContext={onChangeContext}
        onSelectRecentContext={onSelectRecentContext}
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
