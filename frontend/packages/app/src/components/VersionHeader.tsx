import styled, { css } from 'styled-components';
import { Tooltip } from '@radix-ui/themes';
import {
  ChevronLeft,
  Eye,
  ChevronRight,
  RotateCw,
  Target,
  Pin,
  PinOff,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import type { Version } from '@dna/core';
import { UserAvatar } from './UserAvatar';
import { VersionFieldEditor } from './VersionFieldEditor';
import { useHotkeyConfig } from '../hotkeys';
import { useVersionStatuses } from '../hooks';
import { useFeatureFlags, useNomenclature } from '../contexts';

interface VersionHeaderProps {
  shotCode?: string;
  versionNumber?: string;
  submittedBy?: string;
  submittedByImageUrl?: string;
  dateSubmitted?: string;
  versionStatus?: string;
  projectId?: string;
  thumbnailUrl?: string;
  links?: string[];
  onBack?: () => void;
  onNext?: () => void;
  onInReview?: () => void;
  onRefresh?: () => void;
  onSetInReview?: () => void;
  onVersionStatusChange?: (code: string) => void;
  prodtrackDetailUrl?: string | null;
  prodtrackTabUsesExtension?: boolean;
  onSyncProdtrackTab?: () => void | Promise<void>;
  syncProdtrackDisabled?: boolean;
  syncProdtrackTitle?: string;
  canGoBack?: boolean;
  canGoNext?: boolean;
  hasInReview?: boolean;
  isCurrentVersionInReview?: boolean;
  /** The in-review version is pinned; setting another version unpins it. */
  isInReviewPinned?: boolean;
  isSettingInReview?: boolean;
  version?: Version | null;
  playlistId?: string | null;
}

const HeaderWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

/*
 * The buttons keep their shape and their one row whatever the width: none
 * shrinks, no label wraps, and nothing moves to a second line. When the row
 * runs out of room (a narrow window, or the sidebar expanded), it stays its
 * full width and runs off the right edge, and the content area scrolls
 * sideways to reach the rest.
 */
const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: max-content;

  button,
  a {
    flex-shrink: 0;
    white-space: nowrap;
  }
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.secondary};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    color: ${({ theme }) => theme.colors.text.primary};
    border-color: ${({ theme }) => theme.colors.border.strong};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const TopBarActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const InReviewButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.secondary};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    color: ${({ theme }) => theme.colors.text.primary};
    border-color: ${({ theme }) => theme.colors.border.strong};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const syncProdtrackSurface = css`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.secondary};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};
  box-sizing: border-box;
  /* As a link (no tab-sync extension) this inherits the page's taller line
     height, where a button uses the font's own; that made it 2px taller
     than the buttons beside it. */
  line-height: normal;
`;

const SyncProdtrackButton = styled.button`
  ${syncProdtrackSurface}

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    color: ${({ theme }) => theme.colors.text.primary};
    border-color: ${({ theme }) => theme.colors.border.strong};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const SyncProdtrackLink = styled.a`
  ${syncProdtrackSurface}
  text-decoration: none;

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    color: ${({ theme }) => theme.colors.text.primary};
    border-color: ${({ theme }) => theme.colors.border.strong};
  }
`;

const NextVersionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: #ffffff;
  background: ${({ theme }) => theme.colors.accent.main};
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.accent.hover};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: 1px dashed ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.md};
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    color: ${({ theme }) => theme.colors.text.primary};
    border-color: ${({ theme }) => theme.colors.border.strong};
  }
`;

const MainContent = styled.div`
  display: flex;
  gap: 24px;
`;

const ThumbnailWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  flex-shrink: 0;
  height: 224px;
`;

const Thumbnail = styled.div`
  width: 280px;
  height: 180px;
  background: ${({ theme }) => theme.colors.bg.overlay};
  border-radius: ${({ theme }) => theme.radii.lg};
  flex-shrink: 0;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const SetInReviewButton = styled.button<{ $isInReview?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme, $isInReview }) =>
    $isInReview ? theme.colors.accent.main : theme.colors.text.secondary};
  background: ${({ theme, $isInReview }) =>
    $isInReview ? theme.colors.accent.main + '15' : 'transparent'};
  border: 1px ${({ $isInReview }) => ($isInReview ? 'solid' : 'dashed')}
    ${({ theme, $isInReview }) =>
      $isInReview ? theme.colors.accent.main : theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    background: ${({ theme, $isInReview }) =>
      $isInReview
        ? theme.colors.accent.main + '15'
        : theme.colors.bg.surfaceHover};
    color: ${({ theme, $isInReview }) =>
      $isInReview ? theme.colors.accent.main : theme.colors.text.primary};
    border-color: ${({ theme, $isInReview }) =>
      $isInReview ? theme.colors.accent.main : theme.colors.border.strong};
  }

  /* Only disabled while a request is in flight; requests are fast enough that
     dimming would just read as a flicker. */
  &:disabled {
    cursor: default;
  }
`;

const MetadataSection = styled.div`
  flex: 1;
  display: grid;
  grid-auto-flow: column;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: auto repeat(4, minmax(28px, auto));
  align-content: center;
  gap: 12px 32px;
  min-width: 0;
`;

const VersionTitle = styled.h1`
  grid-column: 1 / -1;
  grid-row: 1;
  min-width: 0;
  padding-right: 112px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.primary};
`;

const VersionTitleCode = styled.span`
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const MetadataRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const MetadataLabel = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.muted};
  min-width: 110px;
`;

const MetadataValue = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  display: flex;
  align-items: center;
  gap: 8px;
`;

const LinkBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  height: 26px;
  box-sizing: border-box;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.sm};
`;

const StatusSelectWrapper = styled.div`
  position: relative;
`;

const StatusSelect = styled.select`
  appearance: none;
  padding: 4px 28px 4px 10px;
  height: 26px;
  box-sizing: border-box;
  font-size: 12px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.sm};
  outline: none;
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:focus {
    border-color: ${({ theme }) => theme.colors.accent.main};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.accent.subtle};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const StatusSelectIcon = styled.div`
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: ${({ theme }) => theme.colors.text.muted};
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LinksContainer = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

export function VersionHeader({
  shotCode,
  versionNumber,
  submittedBy,
  submittedByImageUrl,
  dateSubmitted,
  versionStatus,
  projectId,
  thumbnailUrl,
  links = [],
  onBack,
  onNext,
  onInReview,
  onRefresh,
  onSetInReview,
  onVersionStatusChange,
  prodtrackDetailUrl,
  prodtrackTabUsesExtension = false,
  onSyncProdtrackTab,
  syncProdtrackDisabled = false,
  syncProdtrackTitle,
  canGoBack = true,
  canGoNext = true,
  hasInReview = true,
  isCurrentVersionInReview = false,
  isInReviewPinned = false,
  isSettingInReview = false,
  version,
  playlistId,
}: VersionHeaderProps) {
  const t = useNomenclature();
  const { getLabel } = useHotkeyConfig();
  const syncTitle =
    syncProdtrackTitle ??
    `Open current ${t.version.lower} in ${t.productionTracking.lower} (browser tab)`;
  const { inReviewEnabled } = useFeatureFlags();
  const { statuses, isLoading: isLoadingStatuses } = useVersionStatuses({ projectId });
  const displayTitle = shotCode && versionNumber ? `${shotCode} - ` : '';
  const displayCode = versionNumber || shotCode || `Untitled ${t.version.singular}`;

  return (
    <HeaderWrapper>
      <TopBar>
        <Tooltip content={`Previous ${t.version.singular} (${getLabel('previousVersion')})`}>
          <BackButton onClick={onBack} disabled={!canGoBack}>
            <ChevronLeft size={16} />
            Previous {t.version.singular}
          </BackButton>
        </Tooltip>
        <TopBarActions>
          {inReviewEnabled && (
            <InReviewButton onClick={onInReview} disabled={!hasInReview}>
              <Eye size={14} />
              In Review
            </InReviewButton>
          )}
          {prodtrackDetailUrl && prodtrackTabUsesExtension && onSyncProdtrackTab && (
            <Tooltip content={syncTitle}>
              <SyncProdtrackButton
                type="button"
                onClick={() => void onSyncProdtrackTab()}
                disabled={syncProdtrackDisabled}
              >
                <ExternalLink size={14} />
                {t.productionTracking.short} tab
              </SyncProdtrackButton>
            </Tooltip>
          )}
          {prodtrackDetailUrl && !prodtrackTabUsesExtension && (
            <Tooltip content={syncTitle}>
              <SyncProdtrackLink
                href={prodtrackDetailUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} />
                {t.productionTracking.short} tab
              </SyncProdtrackLink>
            </Tooltip>
          )}
          <Tooltip content={`Next ${t.version.singular} (${getLabel('nextVersion')})`}>
            <NextVersionButton onClick={onNext} disabled={!canGoNext}>
              Next {t.version.singular}
              <ChevronRight size={16} />
            </NextVersionButton>
          </Tooltip>
          <RefreshButton onClick={onRefresh} title={`Refresh ${t.version.lower} info`}>
            <RotateCw size={16} />
          </RefreshButton>
        </TopBarActions>
      </TopBar>
      <MainContent>
        <ThumbnailWrapper>
          <Thumbnail>
            {thumbnailUrl && <img src={thumbnailUrl} alt={displayCode} />}
          </Thumbnail>
          {inReviewEnabled && (
            <Tooltip
              content={
                isCurrentVersionInReview
                  ? `${isInReviewPinned ? 'Unpin from review' : 'Pin in review'} (${getLabel('setInReview')})`
                  : isInReviewPinned
                    ? `Set In Review and unpin the current ${t.version.lower} (${getLabel('setInReview')})`
                    : `Set In Review (${getLabel('setInReview')})`
              }
            >
              <SetInReviewButton
                $isInReview={isCurrentVersionInReview}
                onClick={onSetInReview}
                disabled={isSettingInReview}
                aria-busy={isSettingInReview}
              >
                {isCurrentVersionInReview ? (
                  <>
                    {isInReviewPinned ? <PinOff size={14} /> : <Pin size={14} />}
                    {isInReviewPinned ? 'Unpin' : 'Pin in Review'}
                  </>
                ) : (
                  <>
                    <Target size={14} />
                    Set In Review
                  </>
                )}
              </SetInReviewButton>
            </Tooltip>
          )}
        </ThumbnailWrapper>
        <MetadataSection>
          <VersionTitle>
            {displayTitle}
            <VersionTitleCode>{displayCode}</VersionTitleCode>
          </VersionTitle>
          <MetadataRow>
            <MetadataLabel>Submitted by:</MetadataLabel>
            <MetadataValue>
              <UserAvatar
                name={submittedBy}
                imageUrl={submittedByImageUrl}
                size="1"
              />
              {submittedBy}
            </MetadataValue>
          </MetadataRow>
          <MetadataRow>
            <MetadataLabel>Date Submitted:</MetadataLabel>
            <MetadataValue>{dateSubmitted}</MetadataValue>
          </MetadataRow>
          <MetadataRow>
            <MetadataLabel>
              {t.version.singular} {t.status.singular}:
            </MetadataLabel>
            <MetadataValue>
              <StatusSelectWrapper>
                <StatusSelect
                  value={versionStatus ?? ''}
                  onChange={(e) => onVersionStatusChange?.(e.target.value)}
                  disabled={isLoadingStatuses}
                >
                  {isLoadingStatuses && <option value="">Loading...</option>}
                  {statuses.map((status) => (
                    <option key={status.code} value={status.code}>
                      {status.name}
                    </option>
                  ))}
                </StatusSelect>
                <StatusSelectIcon>
                  <ChevronDown size={12} />
                </StatusSelectIcon>
              </StatusSelectWrapper>
            </MetadataValue>
          </MetadataRow>
          <MetadataRow>
            <MetadataLabel>Links:</MetadataLabel>
            <LinksContainer>
              {links.map((link, index) => (
                <LinkBadge key={index}>{link}</LinkBadge>
              ))}
            </LinksContainer>
          </MetadataRow>
          {version && (
            <VersionFieldEditor version={version} playlistId={playlistId} />
          )}
        </MetadataSection>
      </MainContent>
    </HeaderWrapper>
  );
}
