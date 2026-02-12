import { useRef, useCallback } from 'react';
import styled from 'styled-components';
import type { Version } from '@dna/core';
import { VersionHeader } from './VersionHeader';
import { NoteEditor, type NoteEditorHandle } from './NoteEditor';
import { AssistantPanel } from './AssistantPanel';
import { usePlaylistMetadata, useSetInReview } from '../hooks';

interface ContentAreaProps {
  version?: Version | null;
  versions?: Version[];
  playlistId?: number | null;
  userEmail?: string | null;
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

export function ContentArea({
  version,
  versions = [],
  playlistId,
  userEmail,
  onVersionSelect,
  onRefresh,
}: ContentAreaProps) {
  const noteEditorRef = useRef<NoteEditorHandle>(null);
  const currentIndex = version
    ? versions.findIndex((v) => v.id === version.id)
    : -1;
  const canGoBack = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < versions.length - 1;

  const { data: playlistMetadata } = usePlaylistMetadata(playlistId ?? null);
  const { setInReview, isLoading: isSettingInReview } = useSetInReview(
    playlistId ?? null
  );

  const inReviewVersionId = playlistMetadata?.in_review;
  const inReviewVersion = inReviewVersionId
    ? versions.find((v) => v.id === inReviewVersionId)
    : versions.find((v) => v.status === IN_REVIEW_STATUS);
  const hasInReview = !!inReviewVersion;
  const isCurrentVersionInReview =
    version && inReviewVersionId ? version.id === inReviewVersionId : false;

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

  const handleSetInReview = async () => {
    if (version && playlistId) {
      await setInReview(version.id);
    }
  };

  const handleInsertNote = useCallback((content: string) => {
    noteEditorRef.current?.appendContent(content);
  }, []);

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
  const versionNumber =
    version.name?.replace(entityName, '').replace(/^[\s\-_]+/, '') ||
    version.name ||
    '';
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
        onSetInReview={handleSetInReview}
        canGoBack={canGoBack}
        canGoNext={canGoNext}
        hasInReview={hasInReview}
        isCurrentVersionInReview={isCurrentVersionInReview}
        isSettingInReview={isSettingInReview}
        onRefresh={onRefresh}
      />
      <NoteEditor
        ref={noteEditorRef}
        playlistId={playlistId}
        versionId={version.id}
        userEmail={userEmail}
      />
      <AssistantPanel
        playlistId={playlistId}
        versionId={version.id}
        userEmail={userEmail}
        onInsertNote={handleInsertNote}
      />
    </ContentWrapper>
  );
}
