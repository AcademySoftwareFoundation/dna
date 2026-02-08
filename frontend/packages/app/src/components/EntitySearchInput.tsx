import { useState, useRef } from 'react';
import styled from 'styled-components';
import { Search, Loader2 } from 'lucide-react';
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

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const PillsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
`;

const SearchInputContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.sm};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:focus-within {
    border-color: ${({ theme }) => theme.colors.accent.main};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.accent.subtle};
  }
`;

const SearchIcon = styled.div`
  display: flex;
  align-items: center;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const Input = styled.input`
  flex: 1;
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

const EntityType = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.muted};
  background: ${({ theme }) => theme.colors.bg.base};
  padding: 2px 6px;
  border-radius: ${({ theme }) => theme.radii.sm};
`;

const EntityName = styled.span`
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

  // Filter out already selected entities
  const availableResults = results.filter(
    (result) =>
      !value.some((v) => v.id === result.id && v.type === result.type) &&
      !lockedEntities.some((l) => l.id === result.id && l.type === result.type)
  );

  // Handle keyboard navigation for combobox items
  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || availableResults.length === 0) return;

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
    }
  }

  function handleSelect(entity: SearchResult) {
    onChange([...value, entity]);
    setQuery('');
    setHighlightedIndex(0);
    inputRef.current?.focus();
  }

  function handleRemove(entity: SearchResult) {
    onChange(value.filter((v) => !(v.id === entity.id && v.type === entity.type)));
  }

  const allEntities = [...lockedEntities, ...value];
  const showDropdown = query.length > 0;

  return (
    <Container>
      {allEntities.length > 0 && (
        <PillsContainer>
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
        </PillsContainer>
      )}

      <Popover.Root open={isOpen && showDropdown} onOpenChange={setIsOpen}>
        <Popover.Trigger asChild>
          <SearchInputContainer>
            <SearchIcon>
              {isLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Search size={14} />
              )}
            </SearchIcon>
            <Input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={isOpen && showDropdown}
              aria-haspopup="listbox"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
                setHighlightedIndex(0);
              }}
              onFocus={() => query.length > 0 && setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
            />
          </SearchInputContainer>
        </Popover.Trigger>

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
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <EntityType>{result.type}</EntityType>
                  <EntityName>{result.name}</EntityName>
                  {result.email && <EntityEmail>{result.email}</EntityEmail>}
                </DropdownItem>
              ))
            )}
          </div>
        </StyledPopoverContent>
      </Popover.Root>
    </Container>
  );
}
