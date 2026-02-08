import styled from 'styled-components';
import { X, User, Film, Box, ListVideo, CheckSquare, List } from 'lucide-react';
import { SearchResult } from '@dna/core';

export interface EntityPillProps {
  entity: SearchResult;
  onRemove?: () => void;
  removable?: boolean;
}

const PillContainer = styled.div<{ $entityType: string }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 12px;
  font-family: ${({ theme }) => theme.fonts.sans};
  background: ${({ theme, $entityType }) => {
    switch ($entityType) {
      case 'User':
        return theme.colors.accent.subtle;
      case 'Shot':
        return '#2d4a3e';
      case 'Asset':
        return '#4a3d2d';
      case 'Version':
        return '#3d2d4a';
      case 'Task':
        return '#2d3d4a';
      case 'Playlist':
        return '#4a2d3d';
      default:
        return theme.colors.bg.surface;
    }
  }};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.full};
  max-width: 200px;
`;

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.text.muted};
  flex-shrink: 0;
`;

const EntityName = styled.span`
  color: ${({ theme }) => theme.colors.text.primary};
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RemoveButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.colors.text.muted};
  cursor: pointer;
  border-radius: ${({ theme }) => theme.radii.full};
  flex-shrink: 0;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

function getEntityIcon(entityType: string) {
  switch (entityType) {
    case 'User':
      return <User size={12} />;
    case 'Shot':
      return <Film size={12} />;
    case 'Asset':
      return <Box size={12} />;
    case 'Version':
      return <ListVideo size={12} />;
    case 'Task':
      return <CheckSquare size={12} />;
    case 'Playlist':
      return <List size={12} />;
    default:
      return null;
  }
}

export function EntityPill({ entity, onRemove, removable = true }: EntityPillProps) {
  return (
    <PillContainer $entityType={entity.type} title={entity.name}>
      <IconWrapper>{getEntityIcon(entity.type)}</IconWrapper>
      <EntityName>{entity.name}</EntityName>
      {removable && onRemove && (
        <RemoveButton onClick={onRemove} title="Remove">
          <X size={12} />
        </RemoveButton>
      )}
    </PillContainer>
  );
}
