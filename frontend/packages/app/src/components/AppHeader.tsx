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
  readRecentPlaylists,
  readRecentSessions,
  type RecentSessionEntry,
} from '../recentSessions';

export const APP_HEADER_HEIGHT = '64px';

const CONTEXT_NAME_MAX = 20;
/** Playlist codes are often longer; keep dropdown labels more readable. */
const PLAYLIST_DROPDOWN_NAME_MAX = 80;

export type HeaderContextMode = 'session' | 'playlist';

interface AppHeaderProps {
  playlistTabs?: ReactNode;
  /** Label shown in the brand chip (session or playlist name). */
  contextName?: string | null;
  contextMode?: HeaderContextMode | null;
  currentContextId?: string | null;
  changeContextLabel?: string | null;
  onChangeContext?: () => void;
  onSelectRecentContext?: (entry: RecentSessionEntry) => void;
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

const ContextDivider = styled.div`
  width: 1px;
  height: 20px;
  flex-shrink: 0;
  background: ${({ theme }) => theme.colors.border.default};
`;

const ContextTrigger = styled.button<{ $wide?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: ${({ $wide }) => ($wide ? 'min(80ch, 50vw)' : '180px')};
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

const ContextLabel = styled.span`
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
  /* Last resort on a very narrow window: clip rather than run under the
     actions. Before that, the tab strip inside scrolls (SessionTabs). */
  overflow: hidden;
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
`;

function truncateContextName(name: string, max = CONTEXT_NAME_MAX): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max)}…`;
}

export function AppHeader({
  playlistTabs,
  contextName,
  contextMode,
  currentContextId,
  changeContextLabel,
  onChangeContext,
  onSelectRecentContext,
  playlistId,
  projectId,
  userEmail,
  selectedVersionId,
  onLogout,
}: AppHeaderProps) {
  const { data: user } = useGetUserByEmail(userEmail);
  const t = useNomenclature();
  const showContext =
    !!contextName && !!contextMode && !!changeContextLabel && !!onChangeContext;
  const [menuOpen, setMenuOpen] = useState(false);

  const recentEntries = useMemo(() => {
    const entries =
      contextMode === 'session'
        ? readRecentSessions()
        : contextMode === 'playlist'
          ? readRecentPlaylists()
          : [];
    return entries.filter((entry) => entry.id !== currentContextId);
  }, [menuOpen, contextMode, currentContextId]);

  const recentSectionLabel =
    contextMode === 'session'
      ? `Recent ${t.session.lowerPlural}`
      : contextMode === 'playlist'
        ? `Recent ${t.playlist.lowerPlural}`
        : null;
  const playlistWide = contextMode === 'playlist';
  const contextNameMax = playlistWide
    ? PLAYLIST_DROPDOWN_NAME_MAX
    : CONTEXT_NAME_MAX;

  return (
    <Bar>
      <Brand>
        <Logo showText width={120} />
        {showContext && (
          <>
            <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenu.Trigger>
                <ContextTrigger
                  type="button"
                  $wide={playlistWide}
                  aria-label={`${changeContextLabel}: ${contextName}`}
                >
                  <ContextLabel>
                    {truncateContextName(contextName, contextNameMax)}
                  </ContextLabel>
                  <Chevron aria-hidden />
                </ContextTrigger>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="start">
                <DropdownMenu.Item onSelect={onChangeContext}>
                  {changeContextLabel}
                </DropdownMenu.Item>
                {recentEntries.length > 0 && recentSectionLabel && (
                  <>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Label>{recentSectionLabel}</DropdownMenu.Label>
                    {recentEntries.map((entry) => (
                      <DropdownMenu.Item
                        key={entry.id}
                        onSelect={() => onSelectRecentContext?.(entry)}
                      >
                        {truncateContextName(entry.name, contextNameMax)}
                      </DropdownMenu.Item>
                    ))}
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            {playlistTabs ? <ContextDivider aria-hidden /> : null}
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
