import styled from 'styled-components';
import { ChevronLeft, Eye, ChevronRight, RotateCw, Target } from 'lucide-react';
import { UserAvatar } from './UserAvatar';

interface VersionHeaderProps {
  shotCode?: string;
  versionNumber?: string;
  submittedBy?: string;
  submittedByImageUrl?: string;
  dateSubmitted?: string;
  versionStatus?: string;
  thumbnailUrl?: string;
  links?: string[];
  onBack?: () => void;
  onNext?: () => void;
  onInReview?: () => void;
  onRefresh?: () => void;
  onSetInReview?: () => void;
  canGoBack?: boolean;
  canGoNext?: boolean;
  hasInReview?: boolean;
  isCurrentVersionInReview?: boolean;
  isSettingInReview?: boolean;
}

const HeaderWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
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

const NextVersionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.primary};
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
  gap: 8px;
  flex-shrink: 0;
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
  cursor: ${({ $isInReview }) => ($isInReview ? 'default' : 'pointer')};
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

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const MetadataSection = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
`;

const VersionTitle = styled.h1`
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

const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.sm};
`;

const LinkBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.sm};
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
  thumbnailUrl,
  links = [],
  onBack,
  onNext,
  onInReview,
  onRefresh,
  onSetInReview,
  canGoBack = true,
  canGoNext = true,
  hasInReview = true,
  isCurrentVersionInReview = false,
  isSettingInReview = false,
}: VersionHeaderProps) {
  const displayTitle = shotCode && versionNumber ? `${shotCode} - ` : '';
  const displayCode = versionNumber || shotCode || 'Untitled Version';

  return (
    <HeaderWrapper>
      <TopBar>
        <BackButton onClick={onBack} disabled={!canGoBack}>
          <ChevronLeft size={16} />
          Back
        </BackButton>
        <TopBarActions>
          <InReviewButton onClick={onInReview} disabled={!hasInReview}>
            <Eye size={14} />
            In Review
          </InReviewButton>
          <NextVersionButton onClick={onNext} disabled={!canGoNext}>
            Next Version
            <ChevronRight size={16} />
          </NextVersionButton>
          <RefreshButton onClick={onRefresh} title="Refresh version info">
            <RotateCw size={16} />
          </RefreshButton>
        </TopBarActions>
      </TopBar>
      <MainContent>
        <ThumbnailWrapper>
          <Thumbnail>
            {thumbnailUrl && <img src={thumbnailUrl} alt={displayCode} />}
          </Thumbnail>
          <SetInReviewButton
            $isInReview={isCurrentVersionInReview}
            onClick={onSetInReview}
            disabled={isCurrentVersionInReview || isSettingInReview}
          >
            {isSettingInReview ? (
              <>Setting...</>
            ) : isCurrentVersionInReview ? (
              <>
                <Eye size={14} />
                In Review
              </>
            ) : (
              <>
                <Target size={14} />
                Set In Review
              </>
            )}
          </SetInReviewButton>
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
            <MetadataLabel>Version Status:</MetadataLabel>
            <MetadataValue>
              <StatusBadge>{versionStatus}</StatusBadge>
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
        </MetadataSection>
      </MainContent>
    </HeaderWrapper>
  );
}
