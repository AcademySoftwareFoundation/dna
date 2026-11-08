import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ComponentType,
} from 'react';
import styled from 'styled-components';
import { Loader2, Plus } from 'lucide-react';
import { Popover } from '@radix-ui/themes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Playlist } from '@dna/core';
import { apiHandler, useGetPlaylistsForProject } from '../api';
import { useNomenclature } from '../nomenclature';

export interface AddPlaylistToSessionPopoverProps {
  projectId: string;
  linkedPlaylistIds: readonly string[];
  onSelect: (playlist: Playlist) => void;
}

const PopoverTrigger = Popover.Trigger as ComponentType<
  ComponentPropsWithoutRef<typeof Popover.Trigger> & { asChild?: boolean }
>;

const AddButton = styled.button`
  flex-shrink: 0;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.accent.main};
  background: transparent;
  border: none;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  width: 280px;
  max-height: 280px;
`;

const Input = styled.input`
  margin: 8px;
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.bg.surface};
  color: ${({ theme }) => theme.colors.text.primary};
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.colors.accent.main};
  }
`;

const List = styled.div`
  overflow-y: auto;
`;

const Row = styled.button<{ $create?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme, $create }) =>
    $create ? theme.colors.accent.main : theme.colors.text.primary};

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
  }
`;

const Status = styled.div`
  padding: 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

function playlistLabel(playlist: Playlist, fallbackName: string): string {
  return playlist.code || `${fallbackName} ${playlist.id}`;
}

export function AddPlaylistToSessionPopover({
  projectId,
  linkedPlaylistIds,
  onSelect,
}: AddPlaylistToSessionPopoverProps) {
  const t = useNomenclature();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: playlists, isLoading } = useGetPlaylistsForProject(projectId);

  const { mutate: createPlaylist, isPending } = useMutation({
    mutationFn: (name: string) => apiHandler.createPlaylist({ projectId, name }),
    onSuccess: (playlist) => {
      void queryClient.invalidateQueries({ queryKey: ['playlists', projectId] });
      setOpen(false);
      setQuery('');
      onSelect(playlist);
    },
  });

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();
  const available = (playlists ?? []).filter((playlist) => {
    if (linkedPlaylistIds.includes(playlist.id)) return false;
    if (!lower) return true;
    return playlistLabel(playlist, t.playlist.singular).toLowerCase().includes(lower);
  });

  function choose(playlist: Playlist) {
    setOpen(false);
    setQuery('');
    onSelect(playlist);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <AddButton type="button">+ Add playlist</AddButton>
      </PopoverTrigger>
      <Popover.Content side="bottom" align="end" sideOffset={4}>
        <Panel>
          <Input
            ref={inputRef}
            value={query}
            placeholder={`Find or create a ${t.playlist.lower}...`}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && available.length === 0 && trimmed) {
                event.preventDefault();
                if (!isPending) createPlaylist(trimmed);
              }
            }}
          />
          <List>
            {isLoading && <Status>Loading {t.playlist.lowerPlural}...</Status>}
            {available.map((playlist) => (
              <Row
                key={playlist.id}
                type="button"
                onClick={() => choose(playlist)}
              >
                {playlistLabel(playlist, t.playlist.singular)}
              </Row>
            ))}
            {trimmed.length > 0 && (
              <Row
                type="button"
                $create
                disabled={isPending}
                onClick={() => createPlaylist(trimmed)}
              >
                {isPending ? (
                  <Loader2 size={14} />
                ) : (
                  <Plus size={14} />
                )}
                Add {t.playlist.singular} "{trimmed}"
              </Row>
            )}
            {!isLoading && available.length === 0 && trimmed.length === 0 && (
              <Status>Every {t.playlist.lower} is already in this session.</Status>
            )}
          </List>
        </Panel>
      </Popover.Content>
    </Popover.Root>
  );
}
