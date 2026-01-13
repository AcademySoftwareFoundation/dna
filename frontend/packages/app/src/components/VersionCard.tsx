import styled from 'styled-components';
import { Eye } from 'lucide-react';
import type { Version } from '@dna/core';
import { UserAvatar } from './UserAvatar';

interface VersionCardProps {
  version: Version;
  artistName?: string;
  department?: string;
  thumbnailUrl?: string;
  selected?: boolean;
  inReview?: boolean;
  onClick?: () => void;
}

const Card = styled.div<{ $selected?: boolean; $inReview?: boolean }>`
  display: flex;
  gap: 12px;
  padding: 12px;
  background: ${({ theme }) => theme.colors.bg.surface};
  border-radius: ${({ theme }) => theme.radii.lg};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};
  border: 2px ${({ $inReview }) => ($inReview ? 'dashed' : 'solid')}
    ${({ theme, $selected, $inReview }) =>
      $selected
        ? theme.colors.accent.main
        : $inReview
          ? theme.colors.text.muted
          : 'transparent'};

  &:hover {
    border-color: ${({ theme, $selected, $inReview }) =>
      $selected
        ? theme.colors.accent.main
        : $inReview
          ? theme.colors.text.secondary
          : theme.colors.border.strong};
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

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Title = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const InReviewIcon = styled.span`
  display: flex;
  align-items: center;
  color: ${({ theme }) => theme.colors.accent.main};
  flex-shrink: 0;

  svg {
    width: 14px;
    height: 14px;
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

export function VersionCard({
  version,
  artistName,
  department,
  thumbnailUrl,
  selected = false,
  inReview = false,
  onClick,
}: VersionCardProps) {
  const displayName = version.name || `Version ${version.id}`;

  return (
    <Card $selected={selected} $inReview={inReview} onClick={onClick}>
      <Thumbnail>
        {thumbnailUrl && <img src={thumbnailUrl} alt={displayName} />}
      </Thumbnail>
      <Content>
        <TitleRow>
          <Title>{displayName}</Title>
          {inReview && (
            <InReviewIcon>
              <Eye />
            </InReviewIcon>
          )}
        </TitleRow>
        {artistName && (
          <ArtistRow>
            <UserAvatar name={artistName} size="1" />
            <ArtistName>{artistName}</ArtistName>
          </ArtistRow>
        )}
        {department && <Department>{department}</Department>}
      </Content>
    </Card>
  );
}
