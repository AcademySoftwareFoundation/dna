import { useState } from 'react';
import styled from 'styled-components';
import * as Tabs from '@radix-ui/react-tabs';
import { Pin, X } from 'lucide-react';
import type { Playlist } from '@dna/core';
import { useGetPlaylistsForProject } from '../api';
import { ACCENTS } from '../styles';
import { useNomenclature } from '../nomenclature';
import {
  useAddPlaylistToSession,
  useRemovePlaylistFromSession,
  useSession,
  useSessionPlaylists,
} from '../hooks';
import { AddPlaylistToSessionPopover } from './AddPlaylistToSessionPopover';

interface SessionTabsProps {
  sessionId: string;
  projectId: string;
  activePlaylist: Playlist;
  onPlaylistChange: (playlist: Playlist) => void;
}

/*
 * The tabs and the add button side by side. When the header runs out of
 * room, only the tab strip gives: it shrinks and scrolls sideways, and the
 * add button stays put at its end, so the header's actions never reach it.
 */
const StyledTabsRoot = styled(Tabs.Root)`
  display: flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
`;

const StyledTabsList = styled(Tabs.List)`
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
`;

const TabGroup = styled.div`
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  color: ${({ theme }) => theme.colors.text.muted};

  &:hover {
    color: ${({ theme }) => theme.colors.text.secondary};
  }

  &:has([data-state='active']) {
    color: ${({ theme }) => theme.colors.text.primary};
    box-shadow: inset 0 -2px 0 ${({ theme }) => theme.colors.text.primary};
  }
`;

const StyledTabsTrigger = styled(Tabs.Trigger)`
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
  padding: 12px 4px 12px 16px;
  font-size: 14px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: inherit;
  background: transparent;
  border: none;
  cursor: pointer;
`;

const InReviewDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.accent.main};
`;

const PinnedIcon = styled(Pin)`
  width: 14px;
  height: 14px;
  color: ${ACCENTS.pink.colors.main};
  flex-shrink: 0;
`;

const RemoveButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 12px 12px 12px 4px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const RemoveIcon = styled(X)`
  width: 14px;
  height: 14px;
`;

function labelFor(playlist: Playlist | undefined, id: string, fallback: string) {
  if (!playlist) return `${fallback} ${id}`;
  return playlist.code || `${fallback} ${playlist.id}`;
}

export function SessionTabs({
  sessionId,
  projectId,
  activePlaylist,
  onPlaylistChange,
}: SessionTabsProps) {
  const t = useNomenclature();
  const { data: linked, isPending, isError } = useSessionPlaylists(sessionId);
  const { data: dnaSession } = useSession(sessionId);
  const { data: playlists = [] } = useGetPlaylistsForProject(projectId);
  const addPlaylist = useAddPlaylistToSession();
  const removePlaylist = useRemovePlaylistFromSession();
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const waitingForPlaylists = isPending && !linked;
  const linkedIds = linked?.playlist_ids;
  const tabIds = waitingForPlaylists
    ? []
    : linkedIds
      ? linkedIds.includes(activePlaylist.id)
        ? linkedIds
        : [...linkedIds, activePlaylist.id]
      : isError
        ? [activePlaylist.id]
        : [];

  const inReviewPlaylistId = dnaSession?.in_review_playlist_id ?? null;
  const inReviewPinned = !!dnaSession?.in_review_pinned;

  const byId = new Map(playlists.map((playlist) => [playlist.id, playlist]));
  if (!byId.has(activePlaylist.id)) {
    byId.set(activePlaylist.id, activePlaylist);
  }

  function selectPlaylist(playlist: Playlist) {
    setHiddenIds((current) => {
      if (!current.has(playlist.id)) return current;
      const next = new Set(current);
      next.delete(playlist.id);
      return next;
    });
    void addPlaylist.mutate(
      { sessionId, playlistId: playlist.id },
      { onSuccess: () => onPlaylistChange(playlist) }
    );
  }

  function removePlaylistFromSession(playlistId: string) {
    const index = tabIds.indexOf(playlistId);
    const nextId = tabIds[index + 1] ?? tabIds[index - 1];
    removePlaylist.mutate(
      { sessionId, playlistId },
      {
        onSuccess: () => {
          setHiddenIds((current) => new Set(current).add(playlistId));
          if (playlistId !== activePlaylist.id) return;
          const next = nextId ? byId.get(nextId) : undefined;
          if (next) onPlaylistChange(next);
        },
      }
    );
  }

  if (waitingForPlaylists) {
    return null;
  }

  const visibleIds = tabIds.filter((id) => !hiddenIds.has(id));

  return (
    <StyledTabsRoot
      value={activePlaylist.id}
      onValueChange={(id) => {
        const playlist = byId.get(id);
        if (playlist) onPlaylistChange(playlist);
      }}
    >
      <StyledTabsList>
        {visibleIds.map((id) => (
          <TabGroup key={id}>
            <StyledTabsTrigger value={id}>
              {labelFor(byId.get(id), id, t.playlist.singular)}
              {inReviewPlaylistId === id && <InReviewDot />}
              {inReviewPlaylistId === id && inReviewPinned && <PinnedIcon />}
            </StyledTabsTrigger>
            {visibleIds.length > 1 && (
              <RemoveButton
                type="button"
                aria-label={`Remove ${labelFor(byId.get(id), id, t.playlist.singular)}`}
                onClick={() => removePlaylistFromSession(id)}
              >
                <RemoveIcon />
              </RemoveButton>
            )}
          </TabGroup>
        ))}
      </StyledTabsList>
      {/* Outside the scrolling strip, so it is always in view. */}
      <AddPlaylistToSessionPopover
        projectId={projectId}
        linkedPlaylistIds={tabIds}
        onSelect={selectPlaylist}
      />
    </StyledTabsRoot>
  );
}
