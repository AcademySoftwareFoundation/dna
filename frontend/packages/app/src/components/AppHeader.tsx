import type { ReactNode } from 'react';
import styled from 'styled-components';
import { Logo } from './Logo';
import { UserAvatar } from './UserAvatar';
import { PublishControls } from './PublishControls';
import { useGetUserByEmail } from '../api';

export const APP_HEADER_HEIGHT = '64px';

interface AppHeaderProps {
  playlistTabs?: ReactNode;
  playlistId: string | null;
  projectId: string | null;
  userEmail: string;
  selectedVersionId?: string | null;
  onLogout?: () => void;
}

const Bar = styled.header`
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
  width: 100%;
  height: ${APP_HEADER_HEIGHT};
  padding: 0 16px;
  background: ${({ theme }) => theme.colors.sidebar.bg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
  z-index: 200;
`;

const Playlists = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
`;

export function AppHeader({
  playlistTabs,
  playlistId,
  projectId,
  userEmail,
  selectedVersionId,
  onLogout,
}: AppHeaderProps) {
  const { data: user } = useGetUserByEmail(userEmail);

  return (
    <Bar>
      <Logo showText width={120} />
      <Playlists>{playlistTabs}</Playlists>
      <Actions>
        <PublishControls
          playlistId={playlistId}
          projectId={projectId}
          userEmail={userEmail}
          selectedVersionId={selectedVersionId}
        />
        <UserAvatar
          name={user?.name ?? userEmail}
          size="2"
          onLogout={onLogout}
        />
      </Actions>
    </Bar>
  );
}
