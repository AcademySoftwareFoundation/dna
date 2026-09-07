import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { Loader2, Plus, X } from 'lucide-react';
import { Popover } from '@radix-ui/themes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Playlist } from '@dna/core';
import { apiHandler, useGetPlaylistsForProject } from '../api';

export interface ChangePlaylistInputProps {
  projectId: number;
  /** Current playlist (hidden from results) */
  currentPlaylistId?: number;
  onSelect: (playlist: Playlist) => void;
  onClose: () => void;
}

// @radix-ui/themes omits asChild from Popover.Trigger's types even though
// the underlying Radix primitive supports it. Cast once here to keep usage clean.
const PopoverTrigger = Popover.Trigger as React.ComponentType<
  React.ComponentPropsWithoutRef<typeof Popover.Trigger> & { asChild?: boolean }
>;

const Wrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
`;

const FieldContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  padding: 0 10px;
  height: 32px;
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: text;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:focus-within {
    border-color: ${({ theme }) => theme.colors.accent.main};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.accent.subtle};
  }
`;

const Input = styled.input`
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: 13px;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.primary};
  outline: none;

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.muted};
  }
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ theme }) => theme.colors.text.muted};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const StyledPopoverContent = styled(Popover.Content)`
  &&.rt-PopoverContent {
    padding: 0;
    width: var(--radix-popover-trigger-width);
    max-height: 240px;
    overflow-y: auto;
    background: ${({ theme }) => theme.colors.bg.surface};
    border: 1px solid ${({ theme }) => theme.colors.border.default};
    border-radius: ${({ theme }) => theme.radii.md};
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }
`;

const DropdownItem = styled.div<{ $highlighted: boolean; $create?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 13px;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme, $create }) =>
    $create ? theme.colors.accent.main : theme.colors.text.primary};
  background: ${({ theme, $highlighted }) =>
    $highlighted ? theme.colors.bg.surfaceHover : 'transparent'};

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
  }
`;

const PlaylistNameSpan = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const EmptyState = styled.div`
  padding: 16px;
  text-align: center;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const LoadingState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const ErrorText = styled.div`
  padding: 10px 12px;
  font-size: 12px;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.status.error};
`;

function playlistLabel(playlist: Playlist): string {
  return playlist.code || `Playlist ${playlist.id}`;
}

export function ChangePlaylistInput({
  projectId,
  currentPlaylistId,
  onSelect,
  onClose,
}: ChangePlaylistInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // Playlists are already loaded client-side, so open with the full
    // list right away instead of waiting for the user to type.
    setIsOpen(true);
  }, []);

  const queryClient = useQueryClient();
  const { data: playlists, isLoading } = useGetPlaylistsForProject(projectId);

  const {
    mutate: createPlaylist,
    isPending,
    isError,
    error,
    reset: resetCreate,
  } = useMutation({
    mutationFn: (name: string) =>
      apiHandler.createPlaylist({ projectId, name }),
    onSuccess: (playlist) => {
      queryClient.invalidateQueries({ queryKey: ['playlists', projectId] });
      onSelect(playlist);
    },
  });

  // Disabling the input during the mutation blurs it; refocus after a
  // failure so the user can correct the name and retry.
  useEffect(() => {
    if (isError) inputRef.current?.focus();
  }, [isError]);

  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();
  const filtered = (playlists ?? []).filter(
    (playlist) =>
      playlist.id !== currentPlaylistId &&
      (lowerQuery.length === 0 ||
        playlistLabel(playlist).toLowerCase().includes(lowerQuery))
  );

  const canCreate = trimmedQuery.length > 0;
  const optionCount = filtered.length + (canCreate ? 1 : 0);
  const createIndex = filtered.length;

  function handleCreate() {
    if (isPending || !canCreate) return;
    createPlaylist(trimmedQuery);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (!isOpen || optionCount === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < optionCount - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : optionCount - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex === createIndex && canCreate) {
          handleCreate();
        } else if (filtered[highlightedIndex]) {
          onSelect(filtered[highlightedIndex]);
        }
        break;
    }
  }

  const showDropdown = isOpen || isPending || isError;

  return (
    <Wrapper>
      <Popover.Root open={showDropdown} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <FieldContainer onClick={() => inputRef.current?.focus()}>
            <Input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              value={query}
              disabled={isPending}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
                setHighlightedIndex(0);
                if (isError) resetCreate();
              }}
              onFocus={() => setIsOpen(true)}
              onBlur={() => setIsOpen(false)}
              onKeyDown={handleKeyDown}
              placeholder="Change playlist..."
            />
            {isPending && <Loader2 size={14} className="animate-spin" />}
          </FieldContainer>
        </PopoverTrigger>

        <StyledPopoverContent
          side="bottom"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div role="listbox">
            {isError && (
              <ErrorText>
                {error instanceof Error
                  ? error.message
                  : 'Failed to create playlist'}
              </ErrorText>
            )}
            {isLoading ? (
              <LoadingState>
                <Loader2 size={14} className="animate-spin" />
                Loading playlists...
              </LoadingState>
            ) : optionCount === 0 ? (
              <EmptyState>No playlists found</EmptyState>
            ) : (
              <>
                {filtered.map((playlist, index) => (
                  <DropdownItem
                    key={playlist.id}
                    role="option"
                    aria-selected={index === highlightedIndex}
                    $highlighted={index === highlightedIndex}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onSelect(playlist)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <PlaylistNameSpan>
                      {playlistLabel(playlist)}
                    </PlaylistNameSpan>
                  </DropdownItem>
                ))}
                {canCreate && (
                  <DropdownItem
                    role="option"
                    aria-selected={highlightedIndex === createIndex}
                    $highlighted={highlightedIndex === createIndex}
                    $create
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleCreate}
                    onMouseEnter={() => setHighlightedIndex(createIndex)}
                  >
                    <Plus size={14} />
                    <PlaylistNameSpan>
                      Add Playlist &ldquo;{trimmedQuery}&rdquo;
                    </PlaylistNameSpan>
                  </DropdownItem>
                )}
              </>
            )}
          </div>
        </StyledPopoverContent>
      </Popover.Root>
      <CloseButton onClick={onClose} aria-label="Close change playlist">
        <X size={14} />
      </CloseButton>
    </Wrapper>
  );
}
