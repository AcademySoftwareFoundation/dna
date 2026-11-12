import { useMemo, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu } from '@radix-ui/themes';
import { Logo } from './Logo';
import { UserAvatar } from './UserAvatar';
import { PublishControls } from './PublishControls';
import { useGetUserByEmail } from '../api';
import { useNomenclature } from '../nomenclature';
import {
  readRecentSessions,
  type RecentSessionEntry,
} from '../recentSessions';

export const APP_HEADER_HEIGHT = '64px';

const SESSION_NAME_MAX = 20;

interface AppHeaderProps {
  playlistTabs?: ReactNode;
  sessionName?: string | null;
  currentSessionId?: string | null;
  onChangeSession?: () => void;
  onSelectRecentSession?: (entry: RecentSessionEntry) => void;
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

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
`;

const SessionDivider = styled.div`
  width: 1px;
  height: 20px;
  flex-shrink: 0;
  background: ${({ theme }) => theme.colors.border.default};
`;

const SessionTrigger = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 180px;
  margin: 0;
  padding: 4px 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 4px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
    border-color: ${({ theme }) => theme.colors.border.default};
  }
`;

const SessionLabel = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Chevron = styled(ChevronDown)`
  width: 12px;
  height: 12px;
  flex-shrink: 0;
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

function truncateSessionName(name: string): string {
  if (name.length <= SESSION_NAME_MAX) return name;
  return `${name.slice(0, SESSION_NAME_MAX)}…`;
}

export function AppHeader({
  playlistTabs,
  sessionName,
  currentSessionId,
  onChangeSession,
  onSelectRecentSession,
  playlistId,
  projectId,
  userEmail,
  selectedVersionId,
  onLogout,
}: AppHeaderProps) {
  const { data: user } = useGetUserByEmail(userEmail);
  const t = useNomenclature();
  const showSession = !!sessionName && !!onChangeSession;
  const [menuOpen, setMenuOpen] = useState(false);

  // Re-read when the menu opens so newly remembered sessions appear.
  const recentSessions = useMemo(
    () =>
      readRecentSessions().filter((entry) => entry.id !== currentSessionId),
    [menuOpen, currentSessionId]
  );

  return (
    <Bar>
      <Brand>
        <Logo showText width={120} />
        {showSession && (
          <>
            <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenu.Trigger>
                <SessionTrigger
                  type="button"
                  aria-label={`${t.session.singular}: ${sessionName}`}
                >
                  <SessionLabel>{truncateSessionName(sessionName)}</SessionLabel>
                  <Chevron aria-hidden />
                </SessionTrigger>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="start">
                <DropdownMenu.Item onSelect={onChangeSession}>
                  Change {t.session.lower}
                </DropdownMenu.Item>
                {recentSessions.length > 0 && (
                  <>
                    <DropdownMenu.Separator />
                    {recentSessions.map((entry) => (
                      <DropdownMenu.Item
                        key={entry.id}
                        onSelect={() => onSelectRecentSession?.(entry)}
                      >
                        {truncateSessionName(entry.name)}
                      </DropdownMenu.Item>
                    ))}
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            <SessionDivider aria-hidden />
          </>
        )}
      </Brand>
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
