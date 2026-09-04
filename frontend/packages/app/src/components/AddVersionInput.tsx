import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { CornerDownRight, Loader2, Plus, X } from 'lucide-react';
import { Popover } from '@radix-ui/themes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  SearchResult,
  Version,
  normalizeEntitySearchQuery,
} from '@dna/core';
import { apiHandler } from '../api';
import { useEntitySearch } from '../hooks/useEntitySearch';

export interface AddVersionInputProps {
  playlistId: number;
  /** Project ID for scoping search and creating new versions/entities */
  projectId?: number;
  /** Versions already in the playlist (hidden from results) */
  existingVersionIds?: number[];
  onClose: () => void;
  onVersionAdded?: (version: Version) => void;
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

const PendingChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 45%;
  padding: 2px 6px;
  font-size: 12px;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.bg.base};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.sm};
  white-space: nowrap;
  flex-shrink: 0;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.colors.text.muted};
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

const EntityTypeTag = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.muted};
  background: ${({ theme }) => theme.colors.bg.base};
  padding: 2px 6px;
  border-radius: ${({ theme }) => theme.radii.sm};
`;

const EntityNameSpan = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

interface DropdownOption {
  key: string;
  create?: boolean;
  typeTag?: string;
  label: React.ReactNode;
  onSelect: () => void;
}

export function AddVersionInput({
  playlistId,
  projectId,
  existingVersionIds = [],
  onClose,
  onVersionAdded,
}: AddVersionInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  // Set once the user picks "+ Add Version" — switches the input to the
  // link-entity step for the new version with this name.
  const [pendingVersionName, setPendingVersionName] = useState<string | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const linkStep = pendingVersionName !== null;

  useEffect(() => {
    inputRef.current?.focus();
  }, [linkStep]);

  const { query, setQuery, results, isLoading } = useEntitySearch({
    entityTypes: linkStep ? ['shot', 'asset'] : ['version'],
    projectId,
    limit: 10,
  });

  const trimmedQuery = normalizeEntitySearchQuery(query);

  const {
    mutate: addVersion,
    isPending,
    isError,
    error,
    reset: resetAdd,
  } = useMutation({
    mutationFn: (input: {
      versionId?: number;
      versionName?: string;
      linkEntityType?: string;
      linkEntityId?: number;
      linkEntityName?: string;
    }) => apiHandler.addVersionToPlaylist({ playlistId, projectId, ...input }),
    onSuccess: (version) => {
      queryClient.invalidateQueries({ queryKey: ['versions', playlistId] });
      onVersionAdded?.(version);
      onClose();
    },
  });

  // Disabling the input during the mutation blurs it; refocus after a
  // failure so the user can correct the input and retry.
  useEffect(() => {
    if (isError) inputRef.current?.focus();
  }, [isError]);

  const availableResults = linkStep
    ? results
    : results.filter((result) => !existingVersionIds.includes(result.id));

  const canCreate = trimmedQuery.length > 0 && projectId != null;

  function startLinkStep(versionName: string) {
    setPendingVersionName(versionName);
    setQuery('');
    setHighlightedIndex(0);
  }

  function cancelLinkStep() {
    setQuery(pendingVersionName ?? '');
    setPendingVersionName(null);
    setHighlightedIndex(0);
    resetAdd();
  }

  const options: DropdownOption[] = availableResults.map(
    (result: SearchResult) => ({
      key: `${result.type}-${result.id}`,
      typeTag: linkStep ? result.type : undefined,
      label: result.name,
      onSelect: () => {
        if (isPending) return;
        if (linkStep) {
          addVersion({
            versionName: pendingVersionName ?? undefined,
            linkEntityType: result.type.toLowerCase(),
            linkEntityId: result.id,
          });
        } else {
          addVersion({ versionId: result.id });
        }
      },
    })
  );

  if (canCreate) {
    if (linkStep) {
      for (const entityType of ['shot', 'asset'] as const) {
        options.push({
          key: `create-${entityType}`,
          create: true,
          label: (
            <>
              Add {entityType === 'shot' ? 'Shot' : 'Asset'} &ldquo;
              {trimmedQuery}&rdquo;
            </>
          ),
          onSelect: () => {
            if (isPending) return;
            addVersion({
              versionName: pendingVersionName ?? undefined,
              linkEntityType: entityType,
              linkEntityName: trimmedQuery,
            });
          },
        });
      }
    } else {
      options.push({
        key: 'create-version',
        create: true,
        label: (
          <>
            Add Version &ldquo;{trimmedQuery}&rdquo;
          </>
        ),
        onSelect: () => startLinkStep(trimmedQuery),
      });
    }
  }

  const showDropdown =
    (isOpen && trimmedQuery.length > 0) || isPending || isError;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (linkStep) {
        cancelLinkStep();
      } else {
        onClose();
      }
      return;
    }

    // Backspace on an empty input backs out of the link step
    if (e.key === 'Backspace' && query === '' && linkStep) {
      e.preventDefault();
      cancelLinkStep();
      return;
    }

    if (!showDropdown || options.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < options.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : options.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        options[highlightedIndex]?.onSelect();
        break;
    }
  }

  return (
    <Wrapper>
      <Popover.Root open={showDropdown} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <FieldContainer onClick={() => inputRef.current?.focus()}>
            {linkStep && (
              <PendingChip title={`New version "${pendingVersionName}"`}>
                <span>{pendingVersionName}</span>
                <CornerDownRight size={11} />
              </PendingChip>
            )}
            <Input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={showDropdown}
              aria-haspopup="listbox"
              value={query}
              disabled={isPending}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
                setHighlightedIndex(0);
                if (isError) resetAdd();
              }}
              onFocus={() => trimmedQuery.length > 0 && setIsOpen(true)}
              onBlur={() => setIsOpen(false)}
              onKeyDown={handleKeyDown}
              placeholder={
                linkStep ? 'Link to shot or asset...' : 'Add version...'
              }
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
                  : 'Failed to add version'}
              </ErrorText>
            )}
            {isLoading ? (
              <LoadingState>
                <Loader2 size={14} className="animate-spin" />
                Searching...
              </LoadingState>
            ) : (
              options.map((option, index) => (
                <DropdownItem
                  key={option.key}
                  role="option"
                  aria-selected={index === highlightedIndex}
                  $highlighted={index === highlightedIndex}
                  $create={option.create}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={option.onSelect}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {option.create && <Plus size={14} />}
                  {option.typeTag && (
                    <EntityTypeTag>{option.typeTag}</EntityTypeTag>
                  )}
                  <EntityNameSpan>{option.label}</EntityNameSpan>
                </DropdownItem>
              ))
            )}
          </div>
        </StyledPopoverContent>
      </Popover.Root>
      <CloseButton onClick={onClose} aria-label="Close add version">
        <X size={14} />
      </CloseButton>
    </Wrapper>
  );
}
