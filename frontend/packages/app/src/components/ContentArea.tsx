import styled from 'styled-components';
import type { Version } from '@dna/core';
import { VersionHeader } from './VersionHeader';
import { NoteEditor } from './NoteEditor';
import { AssistantPanel } from './AssistantPanel';

interface ContentAreaProps {
  version?: Version | null;
  versions?: Version[];
  onVersionSelect?: (version: Version) => void;
  onRefresh?: () => void;
}

const ContentWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 720px;
  height: 100%;
  min-height: 0;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const EmptyStateTitle = styled.h2`
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const EmptyStateText = styled.p`
  margin: 0;
  font-size: 14px;
`;

function formatDate(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getStatusLabel(status?: string): string {
  const statusMap: Record<string, string> = {
    rev: 'Pending Review',
    apr: 'Approved',
    rej: 'Rejected',
    ip: 'In Progress',
    hld: 'On Hold',
  };
  return status ? statusMap[status] || status : 'Unknown';
}

const IN_REVIEW_STATUS = 'rev';

export function ContentArea({ version, versions = [], onVersionSelect, onRefresh }: ContentAreaProps) {
  const currentIndex = version ? versions.findIndex(v => v.id === version.id) : -1;
  const canGoBack = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < versions.length - 1;
  const inReviewVersion = versions.find(v => v.status === IN_REVIEW_STATUS);
  const hasInReview = !!inReviewVersion;

  const handleBack = () => {
    if (canGoBack && onVersionSelect) {
      onVersionSelect(versions[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (canGoNext && onVersionSelect) {
      onVersionSelect(versions[currentIndex + 1]);
    }
  };

  const handleInReview = () => {
    if (inReviewVersion && onVersionSelect) {
      onVersionSelect(inReviewVersion);
    }
  };

  if (!version) {
    return (
      <ContentWrapper>
        <EmptyState>
          <EmptyStateTitle>No version selected</EmptyStateTitle>
          <EmptyStateText>
            Select a version from the sidebar to view its details
          </EmptyStateText>
        </EmptyState>
      </ContentWrapper>
    );
  }

  const entityName = version.entity?.name || '';
  const versionNumber = version.name?.replace(entityName, '').replace(/^[\s\-_]+/, '') || version.name || '';
  const links: string[] = [];
  if (version.task?.pipeline_step?.name) {
    links.push(version.task.pipeline_step.name);
  }
  if (version.entity?.name) {
    links.push(version.entity.name);
  }

  return (
    <ContentWrapper>
      <VersionHeader
        shotCode={entityName}
        versionNumber={versionNumber}
        submittedBy={version.user?.name}
        dateSubmitted={formatDate(version.created_at as string)}
        versionStatus={getStatusLabel(version.status)}
        thumbnailUrl={version.thumbnail}
        links={links}
        onBack={handleBack}
        onNext={handleNext}
        onInReview={handleInReview}
        canGoBack={canGoBack}
        canGoNext={canGoNext}
        hasInReview={hasInReview}
        onRefresh={onRefresh}
      />
      <NoteEditor />
      <AssistantPanel />
    </ContentWrapper>
  );
}
