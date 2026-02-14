import React, { useState, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { Loader2 } from 'lucide-react';
import { Popover } from '@radix-ui/themes';
import { SearchResult, SearchableEntityType } from '@dna/core';
import { useEntitySearch } from '../hooks/useEntitySearch';
import { EntityPill } from './EntityPill';

export interface EntitySearchInputProps {
  entityTypes: SearchableEntityType[];
  projectId?: number;
  value: SearchResult[];
  onChange: (entities: SearchResult[]) => void;
  placeholder?: string;
  /** Entities that cannot be removed (e.g., auto-added current version) */
  lockedEntities?: SearchResult[];
}

// @radix-ui/themes omits asChild from Popover.Trigger's types even though
// the underlying Radix primitive supports it. Cast once here to keep usage clean.
const PopoverTrigger = Popover.Trigger as React.ComponentType<
  React.ComponentPropsWithoutRef<typeof Popover.Trigger> & { asChild?: boolean }
>;

// Pills and input sit inline in a wrapping flex row so the input always
// appears immediately to the right of the last pill.
const FieldContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  min-height: 38px;
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.sm};
  cursor: text;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:focus-within {
    border-color: ${({ theme }) => theme.colors.accent.main};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.accent.subtle};
  }
`;

const Input = styled.input`
  flex: 1;
  min-width: 80px;
  border: none;
  background: transparent;
  font-size: 13px;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.primary};
  outline: none;
  padding: 2px 0;

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.muted};
  }
`;

const StyledPopoverContent = styled(Popover.Content)`
  &&.rt-PopoverContent {
    padding: 0;
    width: var(--radix-popover-trigger-width);
    max-height: 200px;
    overflow-y: auto;
    background: ${({ theme }) => theme.colors.bg.surface};
    border: 1px solid ${({ theme }) => theme.colors.border.default};
    border-radius: ${({ theme }) => theme.radii.md};
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }
`;

const DropdownItem = styled.div<{ $highlighted: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 13px;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.primary};
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
`;

const EntityEmail = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
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

export function EntitySearchInput({
  entityTypes,
  projectId,
  value,
  onChange,
  placeholder = 'Search...',
  lockedEntities = [],
}: EntitySearchInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { query, setQuery, results, isLoading } = useEntitySearch({
    entityTypes,
    projectId,
    limit: 10,
  });

  const availableResults = results.filter(
    (result) =>
      !value.some((v) => v.id === result.id && v.type === result.type) &&
      !lockedEntities.some((l) => l.id === result.id && l.type === result.type)
  );

  const showDropdown = isOpen && query.length > 0;

  function handleSelect(entity: SearchResult) {
    onChange([...value, entity]);
    setQuery('');
    setHighlightedIndex(0);
    inputRef.current?.focus();
  }

  function handleRemove(entity: SearchResult) {
    onChange(value.filter((v) => !(v.id === entity.id && v.type === entity.type)));
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Backspace on empty input removes the last removable entity
      if (e.key === 'Backspace' && query === '' && value.length > 0) {
        e.preventDefault();
        onChange(value.slice(0, -1));
        return;
      }

      if (!showDropdown || availableResults.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < availableResults.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : availableResults.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (availableResults[highlightedIndex]) {
            handleSelect(availableResults[highlightedIndex]);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [query, value, showDropdown, availableResults, highlightedIndex, onChange]
  );

  const hasEntities = lockedEntities.length > 0 || value.length > 0;

  return (
    <Popover.Root open={showDropdown} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <FieldContainer onClick={() => inputRef.current?.focus()}>
          {lockedEntities.map((entity) => (
            <EntityPill
              key={`${entity.type}-${entity.id}`}
              entity={entity}
              removable={false}
            />
          ))}
          {value.map((entity) => (
            <EntityPill
              key={`${entity.type}-${entity.id}`}
              entity={entity}
              onRemove={() => handleRemove(entity)}
              removable={true}
            />
          ))}
          <Input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={showDropdown}
            aria-haspopup="listbox"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
              setHighlightedIndex(0);
            }}
            onFocus={() => query.length > 0 && setIsOpen(true)}
            onBlur={() => setIsOpen(false)}
            onKeyDown={handleKeyDown}
            placeholder={hasEntities ? '' : placeholder}
          />
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
          {isLoading ? (
            <LoadingState>
              <Loader2 size={14} className="animate-spin" />
              Searching...
            </LoadingState>
          ) : availableResults.length === 0 ? (
            <EmptyState>No results found</EmptyState>
          ) : (
            availableResults.map((result, index) => (
              <DropdownItem
                key={`${result.type}-${result.id}`}
                role="option"
                aria-selected={index === highlightedIndex}
                $highlighted={index === highlightedIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <EntityTypeTag>{result.type}</EntityTypeTag>
                <EntityNameSpan>{result.name}</EntityNameSpan>
                {result.email && <EntityEmail>{result.email}</EntityEmail>}
              </DropdownItem>
            ))
          )}
        </div>
      </StyledPopoverContent>
    </Popover.Root>
  );
}
