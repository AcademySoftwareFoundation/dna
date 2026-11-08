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
  useSessionPlaylistMetadata,
  useSessionPlaylists,
} from '../hooks';
import { AddPlaylistToSessionPopover } from './AddPlaylistToSessionPopover';

interface SessionTabsProps {
  sessionId: string;
  projectId: string;
  activePlaylist: Playlist;
  onPlaylistChange: (playlist: Playlist) => void;
}

const StyledTabsRoot = styled(Tabs.Root)`
  min-width: 0;
  max-width: 100%;
`;

const StyledTabsList = styled(Tabs.List)`
  display: flex;
  align-items: center;
  max-width: 100%;
  overflow-x: auto;
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
  const metadataQueries = useSessionPlaylistMetadata(tabIds);
  const inReviewIds = new Set(
    metadataQueries.flatMap((query) =>
      query.data?.in_review ? [query.data.playlist_id] : []
    )
  );
  const pinnedIds = new Set(
    metadataQueries.flatMap((query) =>
      query.data?.in_review_pinned ? [query.data.playlist_id] : []
    )
  );

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

  return (
    <StyledTabsRoot
      value={activePlaylist.id}
      onValueChange={(playlistId) => {
        const playlist = byId.get(playlistId);
        if (playlist) onPlaylistChange(playlist);
      }}
    >
      <StyledTabsList
        aria-label={`${t.session.singular} ${t.playlist.lowerPlural}`}
      >
        {tabIds
          .filter((playlistId) => !hiddenIds.has(playlistId))
          .map((playlistId) => {
            const playlist = byId.get(playlistId);
            const label = labelFor(playlist, playlistId, t.playlist.singular);
            return (
              <TabGroup key={playlistId}>
                <StyledTabsTrigger value={playlistId}>
                  {label}
                  {inReviewIds.has(playlistId) && (
                    <InReviewDot aria-label="In review" />
                  )}
                  {pinnedIds.has(playlistId) && (
                    <PinnedIcon aria-label="Pinned" />
                  )}
                </StyledTabsTrigger>
                <RemoveButton
                  type="button"
                    aria-label={`Remove ${label} from ${t.session.lower}`}
                  onClick={() => removePlaylistFromSession(playlistId)}
                >
                  <RemoveIcon aria-hidden="true" />
                </RemoveButton>
              </TabGroup>
            );
          })}
        <AddPlaylistToSessionPopover
          projectId={projectId}
          linkedPlaylistIds={tabIds}
          onSelect={selectPlaylist}
        />
      </StyledTabsList>
    </StyledTabsRoot>
  );
}
