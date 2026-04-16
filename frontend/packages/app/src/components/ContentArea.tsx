import { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import type { Version, SearchResult, UserSettings } from '@dna/core';
import { VersionHeader } from './VersionHeader';
import { NoteEditor, type NoteEditorHandle } from './NoteEditor';
import { AssistantPanel } from './AssistantPanel';
import { ProdtrackTabSyncInstallDialog } from './ProdtrackTabSyncInstallDialog';
import { usePlaylistMetadata, useSetInReview, useDraftNote } from '../hooks';
import { useHotkeyAction } from '../hotkeys';
import { apiHandler } from '../api';
import { openProdtrackVersionInExtension } from '../prodtrackTabSync/sendProdtrackTabSync';

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
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  padding-right: 32px;
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

const IN_REVIEW_STATUS = 'rev';

const DEFAULT_PT_SYNC_INSTALL_URL =
  'https://github.com/AcademySoftwareFoundation/dna/blob/main/prodtrack-tab-sync-extension/README.md';

export function ContentArea({
  version,
  versions = [],
  playlistId,
  userEmail,
  onVersionSelect,
  onRefresh,
}: ContentAreaProps) {
  const noteEditorRef = useRef<NoteEditorHandle>(null);

  const currentVersionAsSearchResult = useMemo((): SearchResult | undefined => {
    if (!version) return undefined;
    return { type: 'Version', id: version.id, name: version.name || `Version ${version.id}` };
  }, [version]);

  const versionSubmitter = useMemo((): SearchResult | undefined => {
    if (!version?.user) return undefined;
    return { type: 'User', id: version.user.id, name: version.user.name || '' };
  }, [version?.user]);

  const { draftNote, updateDraftNote, saveAttachmentIds } = useDraftNote({
    playlistId,
    versionId: version?.id,
    userEmail,
    currentVersion: currentVersionAsSearchResult,
    submitter: versionSubmitter,
  });

  const selectedVersionStatus = draftNote?.versionStatus || (version?.status ?? '');

  const handleVersionStatusChange = useCallback((code: string) => {
    updateDraftNote({ versionStatus: code });
  }, [updateDraftNote]);

  const handleRefreshClick = useCallback(() => {
    updateDraftNote({ versionStatus: version?.status ?? '' });
    onRefresh?.();
  }, [version?.status, onRefresh, updateDraftNote]);

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

  const handleBack = useCallback(() => {
    if (canGoBack && onVersionSelect) {
      onVersionSelect(versions[currentIndex - 1]);
    }
  }, [canGoBack, onVersionSelect, versions, currentIndex]);

  const handleNext = useCallback(() => {
    if (canGoNext && onVersionSelect) {
      onVersionSelect(versions[currentIndex + 1]);
    }
  }, [canGoNext, onVersionSelect, versions, currentIndex]);

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

  useHotkeyAction('nextVersion', handleNext);
  useHotkeyAction('previousVersion', handleBack);
  useHotkeyAction('setInReview', handleSetInReview, {
    enabled: !!version && !!playlistId,
  });

  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const extensionId =
    import.meta.env.VITE_PRODTRACK_TAB_SYNC_EXTENSION_ID?.trim() ?? '';
  const installDocUrl =
    import.meta.env.VITE_PRODTRACK_TAB_SYNC_INSTALL_URL?.trim() ||
    DEFAULT_PT_SYNC_INSTALL_URL;

  const { data: userSettings, isSuccess: userSettingsQuerySuccess } =
    useQuery<UserSettings | null>({
      queryKey: ['userSettings', userEmail],
      queryFn: () => apiHandler.getUserSettings({ userEmail: userEmail! }),
      enabled: !!userEmail,
    });


  const shouldAutoSyncProdtrackTab =
    userSettingsQuerySuccess &&
    (userSettings === null ||
      (userSettings.sync_prodtrack_tab_on_version_change ?? true) === true);

  const handleSyncProdtrackTab = useCallback(async () => {
    const url = version?.prodtrack_detail_url;
    if (!url) return;
    if (!extensionId) {
      setInstallDialogOpen(true);
      return;
    }
    const result = await openProdtrackVersionInExtension(extensionId, url);
    if (!result.ok) {
      if (
        result.reason === 'no_extension' ||
        result.reason === 'no_extension_id' ||
        result.reason === 'no_chrome'
      ) {
        setInstallDialogOpen(true);
      }
    }
  }, [version?.prodtrack_detail_url, extensionId]);

  useEffect(() => {
    if (!version?.prodtrack_detail_url) return;
    if (!shouldAutoSyncProdtrackTab) return;
    if (!extensionId) return;
    const url = version.prodtrack_detail_url;
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await openProdtrackVersionInExtension(extensionId, url);
        if (!result.ok) {
          if (
            result.reason === 'no_extension' ||
            result.reason === 'no_extension_id' ||
            result.reason === 'no_chrome'
          ) {
            setInstallDialogOpen(true);
          }
        }
      })();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [
    version?.id,
    version?.prodtrack_detail_url,
    shouldAutoSyncProdtrackTab,
    extensionId,
  ]);

  const syncProdtrackTitle = !version?.prodtrack_detail_url
    ? 'Production tracking URL is not available for this version.'
    : !extensionId
      ? 'Set VITE_PRODTRACK_TAB_SYNC_EXTENSION_ID in your DNA app environment (see install instructions).'
      : 'Open this version in the extension-controlled production-tracking tab.';

  const syncProdtrackDisabled = !version?.prodtrack_detail_url;

  if (!version) {
    return (
      <>
        <ProdtrackTabSyncInstallDialog
          open={installDialogOpen}
          onOpenChange={setInstallDialogOpen}
          installDocUrl={installDocUrl}
        />
        <ContentWrapper>
          <EmptyState>
            <EmptyStateTitle>No version selected</EmptyStateTitle>
            <EmptyStateText>
              Select a version from the sidebar to view its details
            </EmptyStateText>
          </EmptyState>
        </ContentWrapper>
      </>
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
    <>
      <ProdtrackTabSyncInstallDialog
        open={installDialogOpen}
        onOpenChange={setInstallDialogOpen}
        installDocUrl={installDocUrl}
      />
      <ContentWrapper>
      <VersionHeader
        shotCode={entityName}
        versionNumber={versionNumber}
        submittedBy={version.user?.name}
        dateSubmitted={formatDate(version.created_at as string)}
        versionStatus={selectedVersionStatus}
        projectId={version.project?.id}
        thumbnailUrl={version.thumbnail}
        links={links}
        onBack={handleBack}
        onNext={handleNext}
        onInReview={handleInReview}
        onSetInReview={handleSetInReview}
        onVersionStatusChange={handleVersionStatusChange}
        onSyncProdtrackTab={handleSyncProdtrackTab}
        syncProdtrackDisabled={syncProdtrackDisabled}
        syncProdtrackTitle={syncProdtrackTitle}
        canGoBack={canGoBack}
        canGoNext={canGoNext}
        hasInReview={hasInReview}
        isCurrentVersionInReview={isCurrentVersionInReview}
        isSettingInReview={isSettingInReview}
        onRefresh={handleRefreshClick}
      />
      <NoteEditor
        ref={noteEditorRef}
        projectId={version.project?.id}
        currentVersion={version}
        draftNote={draftNote}
        updateDraftNote={updateDraftNote}
        saveAttachmentIds={saveAttachmentIds}
      />
      <AssistantPanel
        playlistId={playlistId}
        versionId={version.id}
        userEmail={userEmail}
        onInsertNote={handleInsertNote}
      />
      </ContentWrapper>
    </>
  );
}
