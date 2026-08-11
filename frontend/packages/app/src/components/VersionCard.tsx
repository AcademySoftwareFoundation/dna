import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled, { type DefaultTheme } from 'styled-components';
import { Eye } from 'lucide-react';
import { Tooltip } from '@radix-ui/themes';
import type { Version } from '@dna/core';
import { UserAvatar } from './UserAvatar';

export type NoteStatus = 'published' | 'edited' | 'draft';

interface VersionCardProps {
  version: Version;
  artistName?: string;
  department?: string;
  thumbnailUrl?: string;
  selected?: boolean;
  inReview?: boolean;
  /** In review because the user pinned it, rather than because RV moved here. */
  pinned?: boolean;
  /**
   * Whether pinning means anything — i.e. RV is connected and would otherwise
   * drive in review. Without it the eye is just a picker: no pin label, no
   * pinned highlight, and the version already in review isn't clickable.
   */
  canPin?: boolean;
  noteStatus?: NoteStatus | null;
  onClick?: () => void;
  /** Omit to render the in-review eye as a non-interactive indicator. */
  onTogglePin?: () => void;
}

const Card = styled.div<{ $selected?: boolean; $pinned?: boolean }>`
  display: flex;
  gap: 12px;
  padding: 12px;
  background: ${({ theme, $pinned }) =>
    $pinned ? theme.colors.accent.subtle : theme.colors.bg.surface};
  border-radius: ${({ theme }) => theme.radii.lg};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};
  border: 2px solid
    ${({ theme, $selected }) =>
    $selected ? theme.colors.accent.main : 'transparent'};

  &:hover {
    border-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.accent.main : theme.colors.border.strong};
  }
`;

const Thumbnail = styled.div`
  width: 100px;
  height: 64px;
  background: ${({ theme }) => theme.colors.bg.overlay};
  border-radius: ${({ theme }) => theme.radii.md};
  flex-shrink: 0;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  flex: 1;
`;

const Title = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const IconsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 6px;
  align-self: stretch;
  margin-left: auto;
  flex-shrink: 0;
`;

const InReviewRow = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
`;

const PinnedLabel = styled.span`
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  color: ${({ theme }) => theme.colors.accent.main};
`;

const InReviewIcon = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.accent.main};

  svg {
    width: 16px;
    height: 16px;
  }
`;

/**
 * Visible whenever the version is in review; otherwise a muted affordance that
 * only surfaces while the card is hovered.
 */
const EyeToggle = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  color: ${({ theme, $active }) =>
    $active ? theme.colors.accent.main : theme.colors.text.muted};
  opacity: ${({ $active }) => ($active ? 1 : 0)};
  transition: opacity ${({ theme }) => theme.transitions.fast},
    color ${({ theme }) => theme.transitions.fast};

  /* Nested so these keep winning over the card-hover reveal above. */
  ${Card}:hover & {
    opacity: ${({ $active }) => ($active ? 1 : 0.5)};

    &:hover,
    &:focus-visible {
      opacity: 1;
    }
  }

  &:hover {
    color: ${({ theme }) => theme.colors.accent.main};
  }

  &:focus-visible {
    opacity: 1;
    outline: 2px solid ${({ theme }) => theme.colors.accent.main};
    outline-offset: 2px;
    border-radius: 3px;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const statusColor = (theme: DefaultTheme, status: NoteStatus) => {
  switch (status) {
    case 'published': return theme.colors.status.success;
    case 'edited': return theme.colors.status.warning;
    case 'draft': return theme.colors.status.info;
  }
};

const StatusIcon = styled.div<{ $status: NoteStatus }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  color: #ffffff;
  cursor: default;
  background-color: ${({ theme, $status }) => statusColor(theme, $status)};
`;

const PortalPill = styled.div<{ $status: NoteStatus }>`
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  padding: 5px 7px;
  border-radius: 6px;
  background-color: ${({ theme }) => theme.colors.bg.surfaceHover};

  span {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    background-color: ${({ theme, $status }) => statusColor(theme, $status) + '33'};
    color: ${({ theme, $status }) => statusColor(theme, $status)};
  }
`;

const ArtistRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const ArtistName = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Department = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

function StatusBadge({ status, label, letter }: { status: NoteStatus; label: string; letter: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({
        top: rect.top - 8, // will be adjusted below the pill via transform
        right: window.innerWidth - rect.right,
      });
    }
  };

  return (
    <>
      <StatusIcon
        ref={ref}
        $status={status}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setPos(null)}
      >
        {letter}
      </StatusIcon>
      {pos && createPortal(
        <PortalPill
          $status={status}
          style={{
            top: pos.top,
            right: pos.right,
            transform: 'translateY(-100%) translateY(-6px)',
          }}
        >
          <span>{label}</span>
        </PortalPill>,
        document.body
      )}
    </>
  );
}

export function VersionCard({
  version,
  artistName,
  department,
  thumbnailUrl,
  selected = false,
  inReview = false,
  pinned = false,
  canPin = false,
  noteStatus = null,
  onClick,
  onTogglePin,
}: VersionCardProps) {
  const displayName = version.name || `Version ${version.id}`;

  const getStatusLetter = (status: NoteStatus) => {
    switch (status) {
      case 'published': return 'P';
      case 'edited': return 'E';
      case 'draft': return 'D';
    }
  };

  const getStatusLabel = (status: NoteStatus) => {
    switch (status) {
      case 'published': return 'Published';
      case 'edited': return 'Published (Edited)';
      case 'draft': return 'Draft';
    }
  };

  const isPinned = pinned && canPin;
  const pinTooltip = isPinned
    ? 'Unpin to resume sync with RV'
    : canPin && inReview
      ? 'Pin in review'
      : 'Set in review';

  const renderEye = () => {
    // Nothing to toggle: either pinning is unavailable entirely, or RV isn't
    // driving in review and this version already holds it.
    if (!onTogglePin || (!canPin && inReview)) {
      return inReview ? (
        <InReviewIcon>
          <Eye />
        </InReviewIcon>
      ) : null;
    }

    return (
      <InReviewRow>
        {isPinned && <PinnedLabel>Pinned</PinnedLabel>}
        <Tooltip content={pinTooltip}>
          <EyeToggle
            type="button"
            $active={inReview}
            aria-label={pinTooltip}
            aria-pressed={isPinned}
            onClick={(e) => {
              // Pinning shouldn't drag the selection along with it.
              e.stopPropagation();
              onTogglePin();
            }}
          >
            <Eye />
          </EyeToggle>
        </Tooltip>
      </InReviewRow>
    );
  };

  return (
    <Card $selected={selected} $pinned={isPinned} onClick={onClick}>
      <Thumbnail>
        {thumbnailUrl && <img src={thumbnailUrl} alt={displayName} />}
      </Thumbnail>
      <Content>
        <Title>{displayName}</Title>
        {artistName && (
          <ArtistRow>
            <UserAvatar name={artistName} size="1" />
            <ArtistName>{artistName}</ArtistName>
          </ArtistRow>
        )}
        {department && <Department>{department}</Department>}
      </Content>
      <IconsContainer>
        {noteStatus ? (
          <StatusBadge
            status={noteStatus}
            label={getStatusLabel(noteStatus)}
            letter={getStatusLetter(noteStatus)}
          />
        ) : (
          <span />
        )}
        {renderEye()}
      </IconsContainer>
    </Card>
  );
}
