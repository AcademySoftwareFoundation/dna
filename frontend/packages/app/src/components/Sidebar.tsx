import { useState, useRef } from 'react';
import styled from 'styled-components';
import {
  PanelLeftClose,
  PanelLeft,
  Settings,
  Upload,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@radix-ui/themes';
import type { Version } from '@dna/core';
import { Logo } from './Logo';
import { UserAvatar } from './UserAvatar';
import { SplitButton } from './SplitButton';
import { ExpandableSearch } from './ExpandableSearch';
import { SquareButton } from './SquareButton';
import { VersionCard } from './VersionCard';
import { TranscriptionMenu } from './TranscriptionMenu';
import { SettingsModal } from './SettingsModal';
import { PublishNotesDialog } from './PublishNotesDialog';
import { useGetVersionsForPlaylist, useGetUserByEmail } from '../api';
import { usePlaylistMetadata, usePlaylistDraftNotes } from '../hooks';

interface SidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onReplacePlaylist?: () => void;
  playlistId: number | null;
  selectedVersionId?: number | null;
  onVersionSelect?: (version: Version) => void;
  userEmail: string;
  onLogout?: () => void;
}

const SidebarWrapper = styled.aside<{ $collapsed: boolean }>`
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  width: ${({ theme, $collapsed }) =>
    $collapsed ? theme.sizes.sidebar.collapsed : theme.sizes.sidebar.expanded};
  background: ${({ theme }) => theme.colors.sidebar.bg};
  border-right: 1px solid ${({ theme }) => theme.colors.sidebar.border};
  display: flex;
  flex-direction: column;
  transition: width ${({ theme }) => theme.transitions.base};
  z-index: 100;
  overflow: hidden;
`;

const Header = styled.div<{ $collapsed: boolean }>`
  padding: ${({ $collapsed }) => ($collapsed ? '12px 8px' : '12px 16px')};
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
  min-height: 64px;
  gap: ${({ $collapsed }) => ($collapsed ? '4px' : '0')};
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
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
  align-items: center;
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

const ToolbarLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
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

const CollapsedToolbar = styled.div`
  display: flex;
  justify-content: center;
  padding: 12px 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
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

const RefetchOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.bg.base}cc;
  z-index: 10;
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
  onReplacePlaylist,
  playlistId,
  selectedVersionId,
  onVersionSelect,
  userEmail,
  onLogout,
}: SidebarProps) {
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const versionRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    data: versions,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useGetVersionsForPlaylist(playlistId);

  const { data: user } = useGetUserByEmail(userEmail);
  const { data: playlistMetadata } = usePlaylistMetadata(playlistId);
  const { data: draftNotes } = usePlaylistDraftNotes(playlistId);

  const inReviewVersionId = playlistMetadata?.in_review;

  const playlistMenuItems = [
    { label: 'Replace Playlist', onSelect: onReplacePlaylist },
    { label: 'Add Version' },
  ];

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
          <StateText>Select a playlist to view versions</StateText>
        </StateContainer>
      );
    }

    if (isLoading) {
      return (
        <StateContainer>
          <LoadingSpinner />
          <StateText>Loading versions...</StateText>
        </StateContainer>
      );
    }

    if (isError) {
      return (
        <StateContainer>
          <ErrorIcon />
          <StateText>{error?.message || 'Failed to load versions'}</StateText>
        </StateContainer>
      );
    }

    if (!versions || versions.length === 0) {
      return (
        <StateContainer>
          <StateText>No versions in this playlist</StateText>
        </StateContainer>
      );
    }

    const isRefetching = isFetching && !isLoading;

    return (
      <VersionListContainer>
        {isRefetching && (
          <RefetchOverlay>
            <LoadingSpinner />
          </RefetchOverlay>
        )}
        <VersionCardList>
          {versions.map((version) => (
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
                inReview={inReviewVersionId === version.id}
                onClick={() => onVersionSelect?.(version)}
              />
            </div>
          ))}
        </VersionCardList>
      </VersionListContainer>
    );
  };

  return (
    <SidebarWrapper $collapsed={collapsed}>
      <Header $collapsed={collapsed}>
        <Logo showText={!collapsed} width={collapsed ? 32 : 120} />
        <HeaderActions>
          {!collapsed && (
            <>
              <Button
                size="2"
                variant="solid"
                color="violet"
                onClick={() => setIsPublishDialogOpen(true)}
              >
                Publish Notes
              </Button>
              <UserAvatar
                name={user?.name ?? userEmail}
                size="2"
                onLogout={onLogout}
              />
            </>
          )}
          <CollapseButton
            onClick={() => onCollapsedChange(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeft /> : <PanelLeftClose />}
          </CollapseButton>
        </HeaderActions>
      </Header>

      {collapsed ? (
        <CollapsedToolbar>
          <TranscriptionMenu playlistId={playlistId} collapsed />
        </CollapsedToolbar>
      ) : (
        <Toolbar>
          {!isSearchExpanded && (
            <ToolbarLeft>
              <SplitButton
                menuItems={playlistMenuItems}
                onClick={() => refetch()}
              >
                Reload Playlist
              </SplitButton>
            </ToolbarLeft>
          )}

          <ExpandableSearch
            placeholder="Search versions..."
            versions={versions}
            selectedVersionId={selectedVersionId}
            onVersionSelect={handleSearchVersionSelect}
            onExpandedChange={setIsSearchExpanded}
          />
        </Toolbar>
      )}

      <ScrollableContent ref={scrollContainerRef}>
        {!collapsed && renderVersionList()}
      </ScrollableContent>

      {collapsed ? (
        <CollapsedFooter>
          <SquareButton
            variant="cta"
            onClick={() => setIsPublishDialogOpen(true)}
          >
            <Upload />
            Publish
          </SquareButton>
          <SettingsModal
            userEmail={userEmail}
            trigger={
              <SquareButton variant="neutral">
                <Settings />
                Settings
              </SquareButton>
            }
          />
        </CollapsedFooter>
      ) : (
        <Footer $collapsed={collapsed}>
          <TranscriptionMenu playlistId={playlistId} />
          <SettingsModal
            userEmail={userEmail}
            trigger={
              <SettingsButton>
                <Settings size={16} />
                Settings
              </SettingsButton>
            }
          />
        </Footer>
      )}



      {playlistId && (
        <PublishNotesDialog
          open={isPublishDialogOpen}
          onClose={() => setIsPublishDialogOpen(false)}
          playlistId={playlistId}
          userEmail={userEmail}
          draftNotes={draftNotes || []}
        />
      )}
    </SidebarWrapper>
  );
}
