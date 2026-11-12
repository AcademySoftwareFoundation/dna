import { useState, useRef, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import styled from 'styled-components';
import {
  PanelLeftClose,
  PanelLeft,
  Settings,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Switch, Tooltip } from '@radix-ui/themes';
import { SCRATCH_VERSION_ID, sessionInReviewForPlaylist } from '@dna/core';
import type { Version, Playlist } from '@dna/core';
import { SplitButton } from './SplitButton';
import { AddVersionInput } from './AddVersionInput';
import { ChangePlaylistInput } from './ChangePlaylistInput';
import { ExpandableSearch, type ExpandableSearchHandle } from './ExpandableSearch';
import { SquareButton } from './SquareButton';
import { VersionCard, NoteStatus } from './VersionCard';
import { TranscriptionMenu } from './TranscriptionMenu';
import { SettingsModal } from './SettingsModal';
import { useGetVersionsForPlaylist, apiHandler } from '../api';
import {
  usePlaylistMetadata,
  useUpsertPlaylistMetadata,
  usePlaylistDraftNotes,
  useSession,
  useSessionSetInReview,
  useFollowInReview,
} from '../hooks';
import { useHotkeyAction, useHotkeyConfig } from '../hotkeys';
import {
  useFeatureFlags,
  useNomenclature,
  useNoteFocus,
} from '../contexts';

interface SidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onPlaylistChange?: (playlist: Playlist) => void;
  playlistId: string | null;
  sessionId?: string | null;
  projectId: string | null;
  selectedVersionId?: string | null;
  onVersionSelect?: (version: Version) => void;
  userEmail: string;
}

const SidebarWrapper = styled.aside<{ $collapsed: boolean }>`
  flex-shrink: 0;
  height: 100%;
  width: ${({ theme, $collapsed }) =>
    $collapsed ? theme.sizes.sidebar.collapsed : theme.sizes.sidebar.expanded};
  background: ${({ theme }) => theme.colors.sidebar.bg};
  border-right: 1px solid ${({ theme }) => theme.colors.sidebar.border};
  display: flex;
  flex-direction: column;
  transition: width ${({ theme }) => theme.transitions.base};
  overflow: hidden;
`;

const SidebarTop = styled.div<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-end')};
  padding: ${({ $collapsed }) => ($collapsed ? '12px 8px' : '8px 12px')};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
`;

const CollapseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radii.sm};
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.muted};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    color: ${({ theme }) => theme.colors.text.primary};
  }

  svg {
    width: 20px;
    height: 20px;
  }
`;

const Toolbar = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
  gap: 12px;

  button[data-accent-color='gray'] {
    color: ${({ theme }) => theme.colors.text.secondary};

    &:hover {
      color: ${({ theme }) => theme.colors.text.primary};
    }
  }
`;

const FollowRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 13px;
`;

const FollowLabel = styled.label`
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
`;

const ToolbarLeft = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  flex-shrink: 0;
`;

const ToolbarRight = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-left: auto;
  flex: 1;
  min-width: 0;
  justify-content: flex-end;
`;

const ScrollableContent = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
`;

const Footer = styled.div<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ $collapsed }) => ($collapsed ? '12px 8px' : '12px 16px')};
  border-top: 1px solid ${({ theme }) => theme.colors.border.subtle};
  gap: 8px;
`;

const SettingsButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 32px;
  font-size: 14px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.secondary};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    color: ${({ theme }) => theme.colors.text.primary};
    border-color: ${({ theme }) => theme.colors.border.strong};
  }

  &:active {
    background: ${({ theme }) => theme.colors.bg.overlay};
    transform: translateY(1px);
  }
`;

const CollapsedFooter = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.subtle};
  gap: 12px;
`;

const VersionCardList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
`;

const VersionListContainer = styled.div`
  position: relative;
`;

const StateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  gap: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
  text-align: center;
`;

const LoadingSpinner = styled(Loader2)`
  width: 24px;
  height: 24px;
  color: ${({ theme }) => theme.colors.accent.main};
  animation: spin 1s linear infinite;

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const ErrorIcon = styled(AlertCircle)`
  width: 24px;
  height: 24px;
  color: ${({ theme }) => theme.colors.status.error};
`;

const StateText = styled.span`
  font-size: 13px;
`;

export function Sidebar({
  collapsed,
  onCollapsedChange,
  onPlaylistChange,
  playlistId,
  sessionId = null,
  projectId,
  selectedVersionId,
  onVersionSelect,
  userEmail,
}: SidebarProps) {
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [toolbarInput, setToolbarInput] = useState<
    'none' | 'add-version' | 'change-playlist'
  >('none');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const versionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<ExpandableSearchHandle>(null);

  const { getLabel } = useHotkeyConfig();
  const { transcriptionEnabled, inReviewEnabled } = useFeatureFlags();

  const toggleSettings = useCallback(() => {
    setIsSettingsOpen((prev) => !prev);
  }, []);

  useHotkeyAction('openSettings', toggleSettings);
  useHotkeyAction('toggleSidebar', () => onCollapsedChange(!collapsed));
  useHotkeyAction('focusSearch', () => searchRef.current?.focus());

  const {
    data: versions,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetVersionsForPlaylist(playlistId);

  const { data: playlistMetadata } = usePlaylistMetadata(playlistId);
  const { data: draftNotes } = usePlaylistDraftNotes(playlistId);
  const { data: dnaSession } = useSession(sessionId);

  const review = sessionInReviewForPlaylist(dnaSession, playlistId);
  const inReviewVersionId = review.versionId;
  const inReviewPinned = review.pinned;
  const { setInReview, setInReviewPinned } = useSessionSetInReview(
    sessionId,
    playlistId
  );
  const noteFocus = useNoteFocus();
  const { follow, setFollow } = useFollowInReview({
    enabled: inReviewEnabled,
    paused: noteFocus?.isNoteFocused ?? false,
    inReviewVersionId,
    versions: versions ?? [],
    selectedVersionId,
    onVersionSelect,
  });

  // Each is non-null only while its toolbar input should be showing.
  const addVersionPlaylistId =
    toolbarInput === 'add-version' ? playlistId : null;
  const changePlaylistProjectId =
    toolbarInput === 'change-playlist' ? projectId : null;
  // An open toolbar input owns the whole row, including the search slot.
  const toolbarInputOpen =
    addVersionPlaylistId !== null || changePlaylistProjectId !== null;

  const queryClient = useQueryClient();
  const upsertPlaylistMetadata = useUpsertPlaylistMetadata(playlistId);
  const hasScratch = !!playlistMetadata?.has_scratch;

  // Placeholder tile for a note on the playlist entity itself. Not a real
  // version: excluded from RV sync, in-review, search, and the versions query.
  const scratchVersion = useMemo<Version>(
    () => ({
      type: 'Version',
      id: SCRATCH_VERSION_ID,
      name: 'SCRATCH PAD',
      notes: [],
      ...(projectId != null
        ? { project: { type: 'Project', id: projectId } }
        : {}),
    }),
    [projectId]
  );

  const handleAddScratch = () => {
    if (!playlistId) return;
    if (!hasScratch) {
      void upsertPlaylistMetadata.mutateAsync({ has_scratch: true });
    }
    // One scratch per playlist: adding again just selects the existing one.
    onVersionSelect?.(scratchVersion);
  };

  const t = useNomenclature();

  const handleRemoveScratch = () => {
    if (!playlistId) return;
    void upsertPlaylistMetadata.mutateAsync({ has_scratch: false });
    void apiHandler
      .deleteDraftNote({
        playlistId,
        versionId: SCRATCH_VERSION_ID,
        userEmail,
      })
      .catch(() => {
        // No draft to delete is fine.
      })
      .finally(() => {
        queryClient.setQueryData(
          ['draftNote', playlistId, SCRATCH_VERSION_ID, userEmail],
          null
        );
        void queryClient.invalidateQueries({
          queryKey: ['draftNotes', playlistId],
        });
      });
    if (selectedVersionId === SCRATCH_VERSION_ID && versions?.length) {
      onVersionSelect?.(versions[0]);
    }
  };

  const playlistMenuItems = [
    {
      label: `Change ${t.playlist.singular}`,
      onSelect: () => setToolbarInput('change-playlist'),
    },
    { label: `Add ${t.version.singular}`, onSelect: () => setToolbarInput('add-version') },
    { label: 'Add Scratch Pad', onSelect: handleAddScratch },
  ];

  const noteStatusFor = (versionId: string): NoteStatus | null => {
    const note = draftNotes?.find((n) => n.version_id === versionId);
    if (!note) return null;
    if (note.published) return 'published';
    if (note.published_note_id) return 'edited';
    if (note.content || note.subject) return 'draft';
    return null;
  };

  const handleSearchVersionSelect = (version: Version) => {
    onVersionSelect?.(version);

    setTimeout(() => {
      const versionElement = versionRefs.current.get(version.id);
      if (versionElement && scrollContainerRef.current) {
        versionElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }, 50);
  };

  const renderVersionList = () => {
    if (!playlistId) {
      return (
        <StateContainer>
          <StateText>Select a {t.playlist.lower} to view {t.version.lowerPlural}</StateText>
        </StateContainer>
      );
    }

    if (isLoading) {
      return (
        <StateContainer>
          <LoadingSpinner />
          <StateText>Loading {t.version.lowerPlural}...</StateText>
        </StateContainer>
      );
    }

    if (isError) {
      return (
        <StateContainer>
          <ErrorIcon />
          <StateText>{error?.message || `Failed to load ${t.version.lowerPlural}`}</StateText>
        </StateContainer>
      );
    }

    if ((!versions || versions.length === 0) && !hasScratch) {
      return (
        <StateContainer>
          <StateText>No {t.version.lowerPlural} in this {t.playlist.lower}</StateText>
        </StateContainer>
      );
    }

    return (
      <VersionListContainer>
        <VersionCardList>
          {hasScratch && (
            <div
              ref={(el) => {
                if (el) {
                  versionRefs.current.set(SCRATCH_VERSION_ID, el);
                } else {
                  versionRefs.current.delete(SCRATCH_VERSION_ID);
                }
              }}
            >
              <VersionCard
                version={scratchVersion}
                selected={selectedVersionId === SCRATCH_VERSION_ID}
                noteStatus={noteStatusFor(SCRATCH_VERSION_ID)}
                onClick={() => onVersionSelect?.(scratchVersion)}
                onRemove={handleRemoveScratch}
              />
            </div>
          )}
          {(versions ?? []).map((version) => (
            <div
              key={version.id}
              ref={(el) => {
                if (el) {
                  versionRefs.current.set(version.id, el);
                } else {
                  versionRefs.current.delete(version.id);
                }
              }}
            >
              <VersionCard
                version={version}
                artistName={version.user?.name}
                department={version.task?.pipeline_step?.name}
                thumbnailUrl={version.thumbnail}
                selected={version.id === selectedVersionId}
                inReview={inReviewEnabled && inReviewVersionId === version.id}
                inReviewPinned={
                  inReviewEnabled &&
                  inReviewPinned &&
                  inReviewVersionId === version.id
                }
                noteStatus={noteStatusFor(version.id)}
                onClick={() => onVersionSelect?.(version)}
                // Taking over from a pinned version also unpins it.
                onSetInReview={
                  inReviewEnabled
                    ? () => void setInReview(version.id, inReviewPinned)
                    : undefined
                }
                onTogglePin={
                  inReviewEnabled && inReviewVersionId === version.id
                    ? () => void setInReviewPinned(version.id, !inReviewPinned)
                    : undefined
                }
              />
            </div>
          ))}
        </VersionCardList>
      </VersionListContainer>
    );
  };

  const collapseControl = (
    <Tooltip content={`${collapsed ? 'Expand' : 'Collapse'} Sidebar (${getLabel('toggleSidebar')})`}>
      <CollapseButton
        onClick={() => onCollapsedChange(!collapsed)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <PanelLeft /> : <PanelLeftClose />}
      </CollapseButton>
    </Tooltip>
  );

  return (
    <SidebarWrapper $collapsed={collapsed}>
      {collapsed ? (
        <SidebarTop $collapsed={collapsed}>{collapseControl}</SidebarTop>
      ) : (
        <Toolbar>
          {!isSearchExpanded &&
            (addVersionPlaylistId ? (
              <AddVersionInput
                playlistId={addVersionPlaylistId}
                projectId={projectId ?? undefined}
                existingVersionIds={(versions ?? []).map((v) => v.id)}
                onClose={() => setToolbarInput('none')}
              />
            ) : changePlaylistProjectId ? (
              <ChangePlaylistInput
                projectId={changePlaylistProjectId}
                currentPlaylistId={playlistId ?? undefined}
                onSelect={(playlist) => {
                  setToolbarInput('none');
                  onPlaylistChange?.(playlist);
                }}
                onClose={() => setToolbarInput('none')}
              />
            ) : (
              <ToolbarLeft>
                <SplitButton
                  menuItems={playlistMenuItems}
                  onClick={() => refetch()}
                >
                  Reload {t.playlist.singular}
                </SplitButton>
                {inReviewEnabled && (
                  <FollowRow>
                    <FollowLabel htmlFor="follow-in-review">
                      Follow In Review
                    </FollowLabel>
                    <Switch
                      id="follow-in-review"
                      size="1"
                      checked={follow}
                      onCheckedChange={(checked) => setFollow(checked === true)}
                    />
                  </FollowRow>
                )}
              </ToolbarLeft>
            ))}

          <ToolbarRight>
            {!toolbarInputOpen && (
              <ExpandableSearch
                ref={searchRef}
                placeholder={`Search ${t.version.lowerPlural}...`}
                versions={versions}
                selectedVersionId={selectedVersionId}
                onVersionSelect={handleSearchVersionSelect}
                onExpandedChange={setIsSearchExpanded}
              />
            )}
            {collapseControl}
          </ToolbarRight>
        </Toolbar>
      )}

      <ScrollableContent ref={scrollContainerRef}>
        {!collapsed && renderVersionList()}
      </ScrollableContent>

      {collapsed ? (
        <CollapsedFooter>
          {transcriptionEnabled && (
            <TranscriptionMenu
              sessionId={sessionId}
              playlistId={playlistId}
              collapsed
            />
          )}
          <Tooltip content={`Settings (${getLabel('openSettings')})`}>
            <SquareButton variant="neutral" onClick={toggleSettings}>
              <Settings />
              Settings
            </SquareButton>
          </Tooltip>
          <SettingsModal
            userEmail={userEmail}
            projectId={projectId}
            open={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
          />
        </CollapsedFooter>
      ) : (
        <Footer $collapsed={collapsed}>
          {transcriptionEnabled && (
            <TranscriptionMenu sessionId={sessionId} playlistId={playlistId} />
          )}
          <Tooltip content={`Settings (${getLabel('openSettings')})`}>
            <SettingsButton onClick={toggleSettings}>
              <Settings size={16} />
              Settings
            </SettingsButton>
          </Tooltip>
          <SettingsModal
            userEmail={userEmail}
            projectId={projectId}
            open={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
          />
        </Footer>
      )}
    </SidebarWrapper>
  );
}
