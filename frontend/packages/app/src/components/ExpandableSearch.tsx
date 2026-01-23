import { useState, useRef, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';
import type { Version } from '@dna/core';

interface ExpandableSearchProps {
  placeholder?: string;
  versions?: Version[];
  selectedVersionId?: number | null;
  onVersionSelect?: (version: Version) => void;
  onExpandedChange?: (isExpanded: boolean) => void;
}

const Container = styled.div<{ $isOpen: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: ${({ $isOpen }) => ($isOpen ? 1 : 'none')};
  min-width: 0;
`;

const PillContainer = styled.div<{ $isOpen: boolean }>`
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 4px 0 12px;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.accent.main};
  background: ${({ theme }) => theme.colors.bg.surface};
  box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.accent.glow};
  width: ${({ $isOpen }) => ($isOpen ? '100%' : '0')};
  opacity: ${({ $isOpen }) => ($isOpen ? 1 : 0)};
  overflow: hidden;
  transition:
    width 300ms cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 200ms ease-out,
    box-shadow ${({ theme }) => theme.transitions.base};
  pointer-events: ${({ $isOpen }) => ($isOpen ? 'auto' : 'none')};

  &:focus-within {
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.accent.glow};
  }
`;

const StyledInput = styled.input`
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.primary};
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 13px;
  outline: none;

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.muted};
  }
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.accent.main};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.base};
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.colors.accent.subtle};
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const ChevronButton = styled.button<{ $disabled?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.text.muted + '60' : theme.colors.text.muted};
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  transition: all ${({ theme }) => theme.transitions.base};
  flex-shrink: 0;
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};

  &:hover {
    background: ${({ theme, $disabled }) =>
      $disabled ? 'transparent' : theme.colors.accent.subtle};
    color: ${({ theme, $disabled }) =>
      $disabled ? theme.colors.text.muted + '60' : theme.colors.accent.main};
  }

  &:active {
    transform: ${({ $disabled }) => ($disabled ? 'none' : 'scale(0.95)')};
  }

  svg {
    width: 20px;
    height: 20px;
  }
`;

const MatchCounter = styled.span`
  font-size: 11px;
  font-family: ${({ theme }) => theme.fonts.mono};
  color: ${({ theme }) => theme.colors.text.muted};
  white-space: nowrap;
  padding: 0 4px;
  flex-shrink: 0;
`;

const SearchButton = styled.button`
  position: absolute;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.muted};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.base};
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.colors.accent.subtle};
    color: ${({ theme }) => theme.colors.accent.main};
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 16px;
    height: 16px;
    transition: transform ${({ theme }) => theme.transitions.base};
  }

  &:hover svg {
    transform: rotate(-10deg);
  }
`;

function searchVersionAttributes(version: Version, query: string): boolean {
  const lowerQuery = query.toLowerCase();

  const searchableFields = [
    version.name,
    version.description,
    version.status,
    version.user?.name,
    version.task?.name,
    version.task?.pipeline_step?.name,
    version.entity?.name,
    version.project?.name,
    String(version.id),
  ];

  return searchableFields.some((field) =>
    field?.toLowerCase().includes(lowerQuery)
  );
}

export function ExpandableSearch({
  placeholder = 'Search...',
  versions = [],
  selectedVersionId,
  onVersionSelect,
  onExpandedChange,
}: ExpandableSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const matchingVersions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return versions.filter((version) =>
      searchVersionAttributes(version, searchQuery)
    );
  }, [versions, searchQuery]);

  const matchCount = matchingVersions.length;
  const hasMatches = matchCount > 0;

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  useEffect(() => {
    onExpandedChange?.(isOpen);
  }, [isOpen, onExpandedChange]);

  useEffect(() => {
    if (selectedVersionId != null && hasMatches) {
      const selectedIndex = matchingVersions.findIndex(
        (v) => v.id === selectedVersionId
      );
      setCurrentMatchIndex(selectedIndex);
    } else {
      setCurrentMatchIndex(-1);
    }
  }, [searchQuery, matchingVersions, selectedVersionId, hasMatches]);

  const handleClose = () => {
    setIsOpen(false);
    setSearchQuery('');
    setCurrentMatchIndex(-1);
  };

  const handleBlur = () => {
    setTimeout(() => handleClose(), 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.key === 'Enter' && hasMatches) {
      e.preventDefault();
      if (e.shiftKey) {
        handlePreviousMatch();
      } else {
        handleNextMatch();
      }
    }
  };

  const handlePreviousMatch = () => {
    if (!hasMatches) return;
    const newIndex =
      currentMatchIndex <= 0 ? matchCount - 1 : currentMatchIndex - 1;
    setCurrentMatchIndex(newIndex);
    onVersionSelect?.(matchingVersions[newIndex]);
  };

  const handleNextMatch = () => {
    if (!hasMatches) return;
    const newIndex =
      currentMatchIndex < 0 || currentMatchIndex >= matchCount - 1
        ? 0
        : currentMatchIndex + 1;
    setCurrentMatchIndex(newIndex);
    onVersionSelect?.(matchingVersions[newIndex]);
  };

  const displayIndex = currentMatchIndex < 0 ? 0 : currentMatchIndex + 1;

  return (
    <Container $isOpen={isOpen}>
      <PillContainer $isOpen={isOpen}>
        <StyledInput
          ref={inputRef}
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {searchQuery.trim() && (
          <MatchCounter>
            {displayIndex}/{matchCount}
          </MatchCounter>
        )}
        <ChevronButton
          aria-label="Previous result"
          tabIndex={-1}
          $disabled={!hasMatches}
          onMouseDown={(e) => {
            e.preventDefault();
            handlePreviousMatch();
          }}
        >
          <ChevronUp />
        </ChevronButton>
        <ChevronButton
          aria-label="Next result"
          tabIndex={-1}
          $disabled={!hasMatches}
          onMouseDown={(e) => {
            e.preventDefault();
            handleNextMatch();
          }}
        >
          <ChevronDown />
        </ChevronButton>
        <IconButton
          onClick={handleClose}
          aria-label="Close search"
          tabIndex={-1}
        >
          <Search />
        </IconButton>
      </PillContainer>
      <SearchButton
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close search' : 'Open search'}
        style={{
          opacity: isOpen ? 0 : 1,
          pointerEvents: isOpen ? 'none' : 'auto',
        }}
      >
        <Search />
      </SearchButton>
    </Container>
  );
}
