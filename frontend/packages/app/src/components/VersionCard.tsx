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

const InReviewIcon = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  color: ${({ theme }) => theme.colors.accent.main};
  flex-shrink: 0;
  margin-left: auto;

  svg {
    width: 16px;
    height: 16px;
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
    <Card $selected={selected} onClick={onClick}>
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
      {inReview && (
        <InReviewIcon>
          <Eye />
        </InReviewIcon>
      )}
    </Card>
  );
}
