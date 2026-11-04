import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled, { type DefaultTheme } from 'styled-components';
import { Eye, NotebookPen, X } from 'lucide-react';
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
  /** Shows the pinned marker next to the in-review eye. */
  inReviewPinned?: boolean;
  noteStatus?: NoteStatus | null;
  onClick?: () => void;
  /**
   * Makes the eye a clickable "Set in review" affordance, revealed on card
   * hover. Omit to render the eye as a non-interactive indicator. The version
   * already in review always shows the plain indicator.
   */
  onSetInReview?: () => void;
  /**
   * Makes the in-review eye on the version already in review clickable: it
   * pins that version, or unpins it when already pinned. Omit to keep the eye
   * a plain indicator.
   */
  onTogglePin?: () => void;
  /**
   * Renders an X where the in-review eye would sit, for tiles that can be
   * removed instead of reviewed (scratch tiles). Mutually exclusive with the
   * eye: when set, inReview is ignored.
   */
  onRemove?: () => void;
}

const Card = styled.div<{ $selected?: boolean }>`
  display: flex;
  gap: 12px;
  padding: 12px;
  background: ${({ theme }) => theme.colors.bg.surface};
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

const ScratchThumb = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.text.muted};

  svg {
    width: 24px;
    height: 24px;
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

/**
 * Right-hand column stretched to the card's height: note status / remove sit
 * at the top, the in-review eye at the bottom so the two never compete for
 * space.
 */
const IconsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-left: auto;
  flex-shrink: 0;
`;

const TopIcons = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const BottomIcons = styled.div`
  display: flex;
  align-items: center;
  margin-top: auto;
`;

const InReviewIcon = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: ${({ theme }) => theme.colors.accent.main};

  svg {
    width: 16px;
    height: 16px;
  }
`;

/** The in-review eye as a button: click to pin, or to unpin when pinned. */
const InReviewButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.accent.main};
  transition: filter ${({ theme }) => theme.transitions.fast};

  &:hover,
  &:focus-visible {
    filter: drop-shadow(0 0 4px ${({ theme }) => theme.colors.accent.main});
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent.main};
    outline-offset: 2px;
    border-radius: 3px;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const PinnedTag = styled.span`
  padding: 4px 8px;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.accent.subtle};
  color: ${({ theme }) => theme.colors.accent.main};
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
`;

/**
 * Hidden until the card is hovered, then a muted gray; glows in the accent
 * color while the button itself is hovered or focused.
 */
const EyeToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text.muted};
  opacity: 0;
  transition: opacity ${({ theme }) => theme.transitions.fast},
    color ${({ theme }) => theme.transitions.fast},
    filter ${({ theme }) => theme.transitions.fast};

  /* Nested so these keep winning over the card-hover reveal above. */
  ${Card}:hover & {
    opacity: 0.5;

    &:hover,
    &:focus-visible {
      opacity: 1;
    }
  }

  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.colors.accent.main};
    filter: drop-shadow(0 0 4px ${({ theme }) => theme.colors.accent.main});
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

/**
 * Hidden until the card is hovered, then a muted gray; glows red while the
 * button itself is hovered or focused.
 */
const RemoveToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text.muted};
  opacity: 0;
  transition: opacity ${({ theme }) => theme.transitions.fast},
    color ${({ theme }) => theme.transitions.fast},
    filter ${({ theme }) => theme.transitions.fast};

  /* Nested so these keep winning over the card-hover reveal above. */
  ${Card}:hover & {
    opacity: 0.5;

    &:hover,
    &:focus-visible {
      opacity: 1;
    }
  }

  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.colors.status.error};
    filter: drop-shadow(0 0 4px ${({ theme }) => theme.colors.status.error});
  }

  &:focus-visible {
    opacity: 1;
    outline: 2px solid ${({ theme }) => theme.colors.status.error};
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
  inReviewPinned = false,
  noteStatus = null,
  onClick,
  onSetInReview,
  onTogglePin,
  onRemove,
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

  const renderRemove = () => (
    <Tooltip content="Remove scratch pad">
      <RemoveToggle
        type="button"
        aria-label="Remove scratch pad"
        onClick={(e) => {
          // Removing shouldn't drag the selection along with it.
          e.stopPropagation();
          onRemove?.();
        }}
      >
        <X />
      </RemoveToggle>
    </Tooltip>
  );

  const renderEye = () => {
    if (inReview) {
      const content = (
        <>
          {inReviewPinned && <PinnedTag>Pinned</PinnedTag>}
          <Eye />
        </>
      );
      if (!onTogglePin) {
        return <InReviewIcon>{content}</InReviewIcon>;
      }
      const label = inReviewPinned ? 'Unpin from review' : 'Pin in review';
      return (
        <Tooltip content={label}>
          <InReviewButton
            type="button"
            aria-label={label}
            aria-pressed={inReviewPinned}
            onClick={(e) => {
              // Pinning shouldn't drag the selection along with it.
              e.stopPropagation();
              onTogglePin();
            }}
          >
            {content}
          </InReviewButton>
        </Tooltip>
      );
    }

    // Setting in review is unavailable.
    if (!onSetInReview) return null;

    return (
      <Tooltip content="Set in review">
        <EyeToggle
          type="button"
          aria-label="Set in review"
          onClick={(e) => {
            // Setting in review shouldn't drag the selection along with it.
            e.stopPropagation();
            onSetInReview();
          }}
        >
          <Eye />
        </EyeToggle>
      </Tooltip>
    );
  };

  const eye = onRemove ? null : renderEye();

  return (
    <Card $selected={selected} onClick={onClick}>
      <Thumbnail>
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={displayName} />
        ) : onRemove ? (
          <ScratchThumb>
            <NotebookPen aria-label="Scratch pad" />
          </ScratchThumb>
        ) : null}
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
        <TopIcons>
          {noteStatus && (
            <StatusBadge
              status={noteStatus}
              label={getStatusLabel(noteStatus)}
              letter={getStatusLetter(noteStatus)}
            />
          )}
          {onRemove && renderRemove()}
        </TopIcons>
        {eye && <BottomIcons>{eye}</BottomIcons>}
      </IconsContainer>
    </Card>
  );
}
