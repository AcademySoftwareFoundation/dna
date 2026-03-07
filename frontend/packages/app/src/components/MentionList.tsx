import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import styled from 'styled-components';
import { SearchResult } from '@dna/core';

const ENTITY_ICONS: Record<string, string> = {
  user: '👤',
  shot: '🎬',
  asset: '📦',
  version: '📄',
  task: '✅',
  playlist: '📋',
  project: '🗂️',
};

const List = styled.div`
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.md};
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  max-height: 280px;
  min-width: 220px;
  overflow-y: auto;
  padding: 4px 0;
`;

const GroupHeader = styled.div`
  padding: 4px 10px 2px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.text.muted};
  font-family: ${({ theme }) => theme.fonts.sans};
`;

const Item = styled.div<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 13px;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.bg.surfaceHover : 'transparent'};

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
  }
`;

const EntityIcon = styled.span`
  font-size: 12px;
  flex-shrink: 0;
`;

const EntityEmail = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.muted};
  margin-left: auto;
`;

const Empty = styled.div`
  padding: 12px 10px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.muted};
  font-family: ${({ theme }) => theme.fonts.sans};
`;

export interface MentionListProps {
  items: SearchResult[];
  command: (attrs: { id: string; label: string }) => void;
}

export interface MentionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const MentionList = forwardRef<MentionListHandle, MentionListProps>(
  function MentionList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i > 0 ? i - 1 : Math.max(0, items.length - 1)));
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i < items.length - 1 ? i + 1 : 0));
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const item = items[selectedIndex];
          if (item) selectItem(item);
          return true;
        }
        return false;
      },
    }));

    function selectItem(item: SearchResult) {
      command({
        id: `${item.type.toLowerCase()}:${item.id}`,
        label: item.name,
      });
    }

    if (!items.length) {
      return (
        <List>
          <Empty>No results</Empty>
        </List>
      );
    }

    // Group results by entity type
    const grouped: Record<string, SearchResult[]> = {};
    items.forEach((item) => {
      const type = item.type.toLowerCase();
      grouped[type] = grouped[type] ?? [];
      grouped[type].push(item);
    });

    let flatIndex = 0;
    return (
      <List>
        {Object.entries(grouped).map(([type, typeItems]) => (
          <div key={type}>
            <GroupHeader>{type.toUpperCase()}S</GroupHeader>
            {typeItems.map((item) => {
              const currentIndex = flatIndex++;
              return (
                <Item
                  key={`${item.type}-${item.id}`}
                  $active={currentIndex === selectedIndex}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectItem(item);
                  }}
                  onMouseEnter={() => setSelectedIndex(currentIndex)}
                >
                  <EntityIcon>{ENTITY_ICONS[type] ?? '•'}</EntityIcon>
                  <span>{item.name}</span>
                  {item.email && <EntityEmail>{item.email}</EntityEmail>}
                </Item>
              );
            })}
          </div>
        ))}
      </List>
    );
  }
);
