import { useState, useEffect, type ReactNode } from 'react';
import styled from 'styled-components';
import type { Version } from '@dna/core';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: ReactNode;
  onReplacePlaylist?: () => void;
  playlistId: number | null;
  selectedVersionId?: number | null;
  onVersionSelect?: (version: Version) => void;
  userEmail: string;
  onLogout?: () => void;
}

const COLLAPSE_BREAKPOINT = 1024;

const LayoutWrapper = styled.div`
  display: flex;
  width: 100%;
  min-height: 100%;
  background: ${({ theme }) => theme.colors.bg.base};
`;

const Main = styled.main<{ $sidebarCollapsed: boolean }>`
  flex: 1;
  margin-left: ${({ theme, $sidebarCollapsed }) =>
    $sidebarCollapsed
      ? theme.sizes.sidebar.collapsed
      : theme.sizes.sidebar.expanded};
  padding: 24px 32px;
  transition: margin-left ${({ theme }) => theme.transitions.base};
  background:
    radial-gradient(
        ellipse 80% 50% at 50% -20%,
        ${({ theme }) => theme.colors.accent.subtle},
        transparent
      )
      fixed,
    ${({ theme }) => theme.colors.bg.base};
  min-height: 100%;
`;

export function Layout({
  children,
  onReplacePlaylist,
  playlistId,
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
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        onReplacePlaylist={onReplacePlaylist}
        playlistId={playlistId}
        selectedVersionId={selectedVersionId}
        onVersionSelect={onVersionSelect}
        userEmail={userEmail}
        onLogout={onLogout}
      />
      <Main $sidebarCollapsed={sidebarCollapsed}>{children}</Main>
    </LayoutWrapper>
  );
}
