import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';
import {
  Dialog,
  Button,
  Checkbox,
  Flex,
  Text,
  Callout,
  IconButton,
  DropdownMenu,
} from '@radix-ui/themes';
import { Loader2, Info, MoreVertical } from 'lucide-react';
import { usePublishNotes } from '../hooks/usePublishNotes';
import { usePublishTranscript } from '../hooks/usePublishTranscript';
import { useSegments } from '../hooks';
import {
  useDraftNote,
  backendToLocal,
  type LocalDraftNote,
} from '../hooks/useDraftNote';
import { useNoteQCChecks } from '../hooks/useNoteQCChecks';
import { DraftNote, Version, SearchResult, NoteQCResult } from '@dna/core';
import { NoteEditor, NoteDraftStatusBadges } from './NoteEditor';
import { UserAvatar } from './UserAvatar';
import { NoteQCResultPill } from './NoteQCResultPill';
import { NoteQCDiffModal } from './NoteQCDiffModal';

interface PublishNotesDialogProps {
  open: boolean;
  onClose: () => void;
  playlistId: number;
  userEmail: string;
  notes: DraftNote[];
  versions?: Version[];
}

export interface PublishNotesTabContentProps {
  open: boolean;
  onClose: () => void;
  playlistId: number;
  userEmail: string;
  notes: DraftNote[];
  versions?: Version[];
  onPendingChange?: (isPending: boolean) => void;
  showTitle?: boolean;
}

const SpinnerIcon = styled(Loader2)`
  animation: spin 1s linear infinite;
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const ResultList = styled.ul`
  margin: 0;
  padding-left: 20px;
  font-size: 14px;
`;

const SummaryBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: ${({ theme }) => theme.colors.bg.surfaceHover};
  border-radius: ${({ theme }) => theme.radii.md};
  margin-top: 12px;
`;

const ScrollBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px;
`;

const FooterBar = styled.div`
  flex-shrink: 0;
  padding: 16px 20px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.subtle};
`;

const VersionCard = styled.div`
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.lg};
  margin-bottom: 16px;
  overflow: hidden;
`;

const VersionCardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.bg.surfaceHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
`;

const Thumb = styled.div`
  width: 48px;
  height: 48px;
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
  flex-shrink: 0;
  background: ${({ theme }) => theme.colors.bg.base};
  border: 1px solid ${({ theme }) => theme.colors.border.default};

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const NoteRowBlock = styled.div`
  padding-bottom: 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
`;

const TranscriptRow = styled.div`
  display: flex;
  align-items: center;
  padding: 10px 0 4px;
`;

const TranscriptExpanded = styled.div`
  max-height: 220px;
  overflow-y: auto;
  padding: 8px 0 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SegmentBlock = styled.div<{ $showHeader: boolean }>`
  padding: ${({ $showHeader }) => ($showHeader ? '6px 0 2px' : '0 0 2px')};
`;

const SegmentSpeakerRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
`;

const SegmentSpeaker = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const SegmentTimestamp = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const ToggleTranscriptButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  padding: 0 6px;
  font-size: 11px;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ theme }) => theme.colors.text.muted};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};
  flex-shrink: 0;
  margin-left: 2px;

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    color: ${({ theme }) => theme.colors.text.primary};
    border-color: ${({ theme }) => theme.colors.border.strong};
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
    pointer-events: none;
  }
`;

const SegmentBody = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

function draftRowKey(d: DraftNote): string {
  return d._id;
}

function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0] || email;
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fallbackVersion(versionId: number): Version {
  return {
    type: 'Version',
    id: versionId,
    name: `Version ${versionId}`,
    notes: [],
  };
}

const RegisterFlushContext = createContext<
  (fn: () => Promise<void>) => () => void
>(() => () => {});

interface PublishNoteRowProps {
  playlistId: number;
  version: Version;
  draftOwnerEmail: string;
  rowDraft: DraftNote;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
  qcLoading: boolean;
  qcRowRefreshing: boolean;
  qcResults: NoteQCResult[];
  qcIgnored: Set<string>;
  onQcToggleIgnore: (checkId: string) => void;
  onQcRefreshDraft: () => Promise<void>;
}

function PublishNoteRow({
  playlistId,
  version,
  draftOwnerEmail,
  rowDraft,
  selected,
  onSelectedChange,
  qcLoading,
  qcRowRefreshing,
  qcResults,
  qcIgnored,
  onQcToggleIgnore,
  onQcRefreshDraft,
}: PublishNoteRowProps) {
  const registerFlush = useContext(RegisterFlushContext);
  const [fixOpen, setFixOpen] = useState(false);
  const [fixResult, setFixResult] = useState<NoteQCResult | null>(null);
  const draftKey = draftRowKey(rowDraft);

  const currentVersionAsSearchResult: SearchResult = useMemo(
    () => ({
      type: 'Version',
      id: version.id,
      name: version.name || `Version ${version.id}`,
    }),
    [version.id, version.name]
  );

  const versionSubmitter: SearchResult | undefined = useMemo(() => {
    if (!version.user) return undefined;
    return {
      type: 'User',
      id: version.user.id,
      name: version.user.name || '',
    };
  }, [version.user]);

  const { draftNote, updateDraftNote, saveAttachmentIds, flushDebouncedSave } =
    useDraftNote({
      playlistId,
      versionId: version.id,
      userEmail: draftOwnerEmail,
      currentVersion: currentVersionAsSearchResult,
      submitter: versionSubmitter,
    });

  useEffect(() => {
    return registerFlush(flushDebouncedSave);
  }, [registerFlush, flushDebouncedSave]);

  const title = `${displayNameFromEmail(draftOwnerEmail)}'s Note`;

  const draftForModal = draftNote ?? backendToLocal(rowDraft);

  const handleQcApply = async (patch: Partial<LocalDraftNote>) => {
    updateDraftNote(patch);
    void (async () => {
      try {
        await flushDebouncedSave();
        await onQcRefreshDraft();
      } catch {
        /* best-effort; refreshingDraftKey clears in hook finally */
      }
    })();
  };

  const handleNoteContentBlur = useCallback(() => {
    void (async () => {
      try {
        await flushDebouncedSave();
        await onQcRefreshDraft();
      } catch {
        /* best-effort */
      }
    })();
  }, [flushDebouncedSave, onQcRefreshDraft]);

  return (
    <NoteRowBlock>
      <NoteQCDiffModal
        open={fixOpen}
        onOpenChange={(o) => {
          setFixOpen(o);
          if (!o) setFixResult(null);
        }}
        draft={draftForModal}
        qcResult={fixResult}
        onApply={handleQcApply}
      />
      <Flex align="center" gap="2" mb="2" wrap="wrap" style={{ width: '100%' }}>
        <Checkbox
          checked={selected}
          onCheckedChange={(c) => onSelectedChange(c === true)}
        />
        <Flex
          align="center"
          gap="2"
          wrap="wrap"
          style={{ flex: 1, minWidth: 0 }}
        >
          <Text size="2" weight="medium" style={{ minWidth: 0 }}>
            {title}
          </Text>
          <NoteDraftStatusBadges
            draft={
              draftNote
                ? {
                    published: draftNote.published,
                    publishedNoteId: draftNote.publishedNoteId,
                    content: draftNote.content,
                    subject: draftNote.subject,
                  }
                : null
            }
            layout="inline"
          />
          <NoteQCResultPill
            draftKey={draftKey}
            results={qcResults}
            loading={qcLoading || qcRowRefreshing}
            ignored={qcIgnored}
            onToggleIgnore={(checkId) => onQcToggleIgnore(checkId)}
            onFix={(r) => {
              setFixResult(r);
              setFixOpen(true);
            }}
            localDraft={draftForModal}
            onFixAll={handleQcApply}
          />
        </Flex>
      </Flex>
      <NoteEditor
        projectId={version.project?.id ?? null}
        currentVersion={version}
        draftNote={draftNote}
        updateDraftNote={updateDraftNote}
        saveAttachmentIds={saveAttachmentIds}
        variant="embedded"
        onNoteContentBlur={handleNoteContentBlur}
      />
    </NoteRowBlock>
  );
}

function formatSegmentTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function VersionTranscriptRow({
  playlistId,
  versionId,
  checked,
  onCheckedChange,
}: {
  playlistId: number;
  versionId: number;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { segments, isLoading } = useSegments({ playlistId, versionId });
  const [expanded, setExpanded] = useState(false);
  const segmentsCount = segments.length;
  const speakerCount = useMemo(
    () => new Set(segments.map((s) => s.speaker).filter(Boolean)).size,
    [segments]
  );

  return (
    <>
      <TranscriptRow>
        <Flex align="center" gap="2">
          <Checkbox
            checked={segmentsCount > 0 && checked}
            disabled={isLoading || segmentsCount === 0}
            onCheckedChange={(c) => onCheckedChange(c === true)}
          />
          <Text
            size="2"
            weight="medium"
            color={isLoading || segmentsCount === 0 ? 'gray' : undefined}
          >
            Transcript
          </Text>
          <Text size="1" color="gray">
            {isLoading
              ? '…'
              : segmentsCount === 0
                ? 'None recorded'
                : `${speakerCount} speaker${speakerCount !== 1 ? 's' : ''}`}
          </Text>
          {(isLoading || segmentsCount > 0) && (
            <ToggleTranscriptButton
              disabled={isLoading}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Hide' : 'Show'}
            </ToggleTranscriptButton>
          )}
        </Flex>
      </TranscriptRow>
      {expanded && segmentsCount > 0 && (
        <TranscriptExpanded>
          {segments.map((seg, idx) => {
            const prev = idx > 0 ? segments[idx - 1] : null;
            const showHeader = !prev || prev.speaker !== seg.speaker;
            return (
              <SegmentBlock key={seg.segment_id} $showHeader={showHeader}>
                {showHeader && (
                  <SegmentSpeakerRow>
                    <SegmentSpeaker>{seg.speaker || 'Unknown'}</SegmentSpeaker>
                    <SegmentTimestamp>
                      {formatSegmentTime(seg.absolute_start_time)}
                    </SegmentTimestamp>
                  </SegmentSpeakerRow>
                )}
                <SegmentBody>{seg.text}</SegmentBody>
              </SegmentBlock>
            );
          })}
        </TranscriptExpanded>
      )}
    </>
  );
}

interface VersionPublishCardProps {
  playlistId: number;
  version: Version;
  drafts: DraftNote[];
  currentUserEmail: string;
  selected: Record<string, boolean>;
  onToggle: (key: string, checked: boolean) => void;
  transcriptChecked: boolean;
  onTranscriptToggle: (checked: boolean) => void;
  qcLoading: boolean;
  qcRefreshingDraftKey: string | null;
  qcResults: Record<string, NoteQCResult[]>;
  qcIgnored: Set<string>;
  onQcToggleIgnore: (draftKey: string, checkId: string) => void;
  onQcRefreshDraft: (d: DraftNote) => Promise<void>;
}

function VersionPublishCard({
  playlistId,
  version,
  drafts,
  currentUserEmail,
  selected,
  onToggle,
  transcriptChecked,
  onTranscriptToggle,
  qcLoading,
  qcRefreshingDraftKey,
  qcResults,
  qcIgnored,
  onQcToggleIgnore,
  onQcRefreshDraft,
}: VersionPublishCardProps) {
  const sortedDrafts = useMemo(
    () =>
      [...drafts].sort((a, b) => {
        const aMine = a.user_email === currentUserEmail;
        const bMine = b.user_email === currentUserEmail;
        if (aMine !== bMine) return aMine ? -1 : 1;
        return a.user_email.localeCompare(b.user_email);
      }),
    [drafts, currentUserEmail]
  );

  return (
    <VersionCard>
      <VersionCardHeader>
        <Thumb>
          {version.thumbnail ? <img src={version.thumbnail} alt="" /> : null}
        </Thumb>
        <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
          <Text
            weight="bold"
            size="2"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {version.name || `Version ${version.id}`}
          </Text>
          <Flex align="center" gap="2">
            {version.user ? (
              <>
                <UserAvatar name={version.user.name} size="1" />
                <Text size="1" color="gray">
                  {version.user.name}
                </Text>
              </>
            ) : (
              <Text size="1" color="gray">
                Unknown submitter
              </Text>
            )}
          </Flex>
        </Flex>
      </VersionCardHeader>
      <Flex direction="column" gap="3" p="3">
        {sortedDrafts.map((d) => (
          <PublishNoteRow
            key={draftRowKey(d)}
            playlistId={playlistId}
            version={version}
            draftOwnerEmail={d.user_email}
            rowDraft={d}
            selected={selected[draftRowKey(d)] ?? false}
            onSelectedChange={(c) => onToggle(draftRowKey(d), c)}
            qcLoading={qcLoading}
            qcRowRefreshing={qcRefreshingDraftKey === draftRowKey(d)}
            qcResults={qcResults[draftRowKey(d)] ?? []}
            qcIgnored={qcIgnored}
            onQcToggleIgnore={(checkId) =>
              onQcToggleIgnore(draftRowKey(d), checkId)
            }
            onQcRefreshDraft={() => onQcRefreshDraft(d)}
          />
        ))}
        <VersionTranscriptRow
          playlistId={playlistId}
          versionId={version.id}
          checked={transcriptChecked}
          onCheckedChange={onTranscriptToggle}
        />
      </Flex>
    </VersionCard>
  );
}

export const PublishNotesTabContent: React.FC<PublishNotesTabContentProps> = ({
  open,
  onClose,
  playlistId,
  userEmail,
  notes,
  versions = [],
  onPendingChange,
  showTitle = true,
}) => {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [transcriptSelected, setTranscriptSelected] = useState<
    Record<number, boolean>
  >({});
  const [successSummary, setSuccessSummary] = useState<{
    publishedCount: number;
    republishedCount: number;
    failedCount: number;
    imageCount: number;
    statusCount: number;
    transcriptPublishedCount: number;
    transcriptSkippedCount: number;
  } | null>(null);
  const {
    mutateAsync: publishNotes,
    isPending,
    isError,
    error,
    reset,
  } = usePublishNotes();
  const { mutateAsync: publishTranscriptAsync } = usePublishTranscript();

  const {
    results: qcResults,
    loading: qcLoading,
    ignored: qcIgnored,
    toggleIgnore: qcToggleIgnore,
    refreshDraft: qcRefreshDraft,
    hasBlockingErrors: qcHasBlockingErrors,
    refreshingDraftKey: qcRefreshingDraftKey,
  } = useNoteQCChecks({ open, playlistId, drafts: notes });

  const flushFnsRef = useRef(new Set<() => Promise<void>>());
  const registerFlush = useCallback((fn: () => Promise<void>) => {
    flushFnsRef.current.add(fn);
    return () => {
      flushFnsRef.current.delete(fn);
    };
  }, []);

  const flushAllDrafts = useCallback(async () => {
    await Promise.all([...flushFnsRef.current].map((f) => f()));
  }, []);

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  useEffect(() => {
    if (open) {
      reset();
      setSuccessSummary(null);
    }
  }, [open, reset]);

  const notesFingerprint = useMemo(
    () => notes.map(draftRowKey).sort().join('\0'),
    [notes]
  );

  useEffect(() => {
    if (!open) return;
    setSelected((prev) => {
      const next: Record<string, boolean> = {};
      for (const d of notes) {
        const k = draftRowKey(d);
        next[k] = prev[k] ?? true;
      }
      return next;
    });
  }, [open, notesFingerprint]);

  const versionCards = useMemo(() => {
    const byVid = new Map<number, DraftNote[]>();
    for (const d of notes) {
      const arr = byVid.get(d.version_id) ?? [];
      arr.push(d);
      byVid.set(d.version_id, arr);
    }

    const ordered: { version: Version; drafts: DraftNote[] }[] = [];
    const seen = new Set<number>();

    for (const v of versions) {
      const drafts = byVid.get(v.id);
      if (drafts?.length) {
        ordered.push({ version: v, drafts });
        seen.add(v.id);
      }
    }

    for (const [vid, drafts] of byVid) {
      if (!seen.has(vid)) {
        ordered.push({ version: fallbackVersion(vid), drafts });
      }
    }

    return ordered;
  }, [notes, versions]);

  useEffect(() => {
    if (!open) return;
    setTranscriptSelected((prev) => {
      const next: Record<number, boolean> = {};
      for (const { version } of versionCards) {
        next[version.id] = prev[version.id] ?? true;
      }
      return next;
    });
  }, [open, versionCards]);

  const selectedCount = useMemo(
    () => notes.filter((d) => selected[draftRowKey(d)]).length,
    [notes, selected]
  );

  const allNotesSelected = useMemo(
    () => notes.length > 0 && notes.every((d) => selected[draftRowKey(d)]),
    [notes, selected]
  );

  const allTranscriptsSelected = useMemo(
    () =>
      versionCards.every(
        ({ version }) => transcriptSelected[version.id] ?? true
      ),
    [versionCards, transcriptSelected]
  );

  const publishBlockedByQc = useMemo(
    () =>
      notes.some(
        (d) => selected[draftRowKey(d)] && qcHasBlockingErrors(draftRowKey(d))
      ),
    [notes, selected, qcHasBlockingErrors]
  );

  const countImages = (notes: DraftNote[]) =>
    notes.reduce((sum, n) => sum + (n.attachment_ids?.length ?? 0), 0);

  const countStatuses = (notes: DraftNote[]) =>
    notes.filter((n) => {
      if (!n.version_status) return false;
      const version = versions.find((v) => v.id === n.version_id);
      return n.version_status !== version?.status;
    }).length;

  const handleBatchSelect = useCallback(
    (mode: 'all' | 'none' | 'mine' | 'others') => {
      setSelected(() => {
        const next: Record<string, boolean> = {};
        for (const d of notes) {
          const k = draftRowKey(d);
          if (mode === 'all') next[k] = true;
          else if (mode === 'none') next[k] = false;
          else if (mode === 'mine') next[k] = d.user_email === userEmail;
          else next[k] = d.user_email !== userEmail;
        }
        return next;
      });
    },
    [notes, userEmail]
  );

  const handleToggle = useCallback((key: string, checked: boolean) => {
    setSelected((prev) => ({ ...prev, [key]: checked }));
  }, []);

  const handleTranscriptToggle = useCallback(
    (versionId: number, checked: boolean) => {
      setTranscriptSelected((prev) => ({ ...prev, [versionId]: checked }));
    },
    []
  );

  const handleBatchTranscriptSelect = useCallback(() => {
    const next: Record<number, boolean> = {};
    for (const { version } of versionCards) {
      next[version.id] = !allTranscriptsSelected;
    }
    setTranscriptSelected(next);
  }, [versionCards, allTranscriptsSelected]);

  const handlePublishSelected = async () => {
    const toPublish = notes.filter((d) => selected[draftRowKey(d)]);
    if (toPublish.length === 0) return;

    await flushAllDrafts();

    const targets = toPublish.map((d) => ({
      user_email: d.user_email,
      version_id: d.version_id,
    }));

    const selectedTranscriptVersionIds = versionCards
      .filter(({ version }) => transcriptSelected[version.id] ?? true)
      .map(({ version }) => version.id);

    const [notesResult, transcriptResults] = await Promise.all([
      publishNotes({ playlistId, request: { user_email: userEmail, targets } }),
      Promise.allSettled(
        selectedTranscriptVersionIds.map((versionId) =>
          publishTranscriptAsync({
            playlistId,
            request: { version_id: versionId },
          })
        )
      ),
    ]);

    const transcriptPublishedCount = transcriptResults.filter(
      (r) =>
        r.status === 'fulfilled' &&
        (r.value.outcome === 'created' || r.value.outcome === 'updated')
    ).length;
    const transcriptSkippedCount = transcriptResults.filter(
      (r) => r.status === 'fulfilled' && r.value.outcome === 'skipped'
    ).length;

    setSuccessSummary({
      publishedCount: notesResult.published_count,
      republishedCount: notesResult.republished_count,
      failedCount: notesResult.failed_count,
      imageCount: countImages(toPublish),
      statusCount: countStatuses(toPublish),
      transcriptPublishedCount,
      transcriptSkippedCount,
    });
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <RegisterFlushContext.Provider value={registerFlush}>
      {successSummary ? (
        <Flex direction="column" gap="4" p="4">
          {showTitle && (
            <Dialog.Title style={{ margin: 0 }}>Publish Notes</Dialog.Title>
          )}
          <Callout.Root color="green">
            <Callout.Icon>
              <Info size={16} />
            </Callout.Icon>
            <Callout.Text>Publishing Complete!</Callout.Text>
          </Callout.Root>

          <SummaryBox>
            <Text weight="bold" size="2">
              Results:
            </Text>
            <ResultList>
              {successSummary.publishedCount > 0 && (
                <li>Notes Published: {successSummary.publishedCount}</li>
              )}
              {successSummary.republishedCount > 0 && (
                <li>Notes Republished: {successSummary.republishedCount}</li>
              )}
              {successSummary.imageCount > 0 && (
                <li>Images Attached: {successSummary.imageCount}</li>
              )}
              {successSummary.statusCount > 0 && (
                <li>Statuses Updated: {successSummary.statusCount}</li>
              )}
              {successSummary.transcriptPublishedCount > 0 && (
                <li>
                  Transcripts Published:{' '}
                  {successSummary.transcriptPublishedCount}
                </li>
              )}
              {successSummary.transcriptSkippedCount > 0 && (
                <li>
                  Transcripts Up to Date:{' '}
                  {successSummary.transcriptSkippedCount}
                </li>
              )}
              {successSummary.failedCount > 0 && (
                <li>Notes Failed: {successSummary.failedCount}</li>
              )}
            </ResultList>
          </SummaryBox>

          <Flex justify="end" mt="4">
            <Dialog.Close>
              <Button onClick={handleClose}>Close</Button>
            </Dialog.Close>
          </Flex>
        </Flex>
      ) : (
        <>
          <Flex
            align="center"
            justify={showTitle ? 'between' : 'end'}
            gap="3"
            p="4"
            style={{
              borderBottom: '1px solid var(--gray-a6)',
              flexShrink: 0,
            }}
          >
            {showTitle && (
              <Dialog.Title style={{ margin: 0 }}>Publish Notes</Dialog.Title>
            )}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <IconButton
                  variant="ghost"
                  color="gray"
                  aria-label="Batch note selection"
                  disabled={notes.length === 0}
                >
                  <MoreVertical size={18} />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                <DropdownMenu.Item
                  onSelect={() =>
                    handleBatchSelect(allNotesSelected ? 'none' : 'all')
                  }
                >
                  {allNotesSelected ? 'Deselect all notes' : 'Select all notes'}
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => handleBatchSelect('mine')}>
                  Select only my notes
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => handleBatchSelect('others')}>
                  Select only notes from others
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item onSelect={handleBatchTranscriptSelect}>
                  {allTranscriptsSelected
                    ? 'Deselect all transcripts'
                    : 'Select all transcripts'}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </Flex>

          <ScrollBody>
            {notes.length === 0 ? (
              <Text size="2" color="gray">
                No notes to publish.
              </Text>
            ) : (
              versionCards.map(({ version, drafts }) => (
                <VersionPublishCard
                  key={version.id}
                  playlistId={playlistId}
                  version={version}
                  drafts={drafts}
                  currentUserEmail={userEmail}
                  selected={selected}
                  onToggle={handleToggle}
                  transcriptChecked={transcriptSelected[version.id] ?? true}
                  onTranscriptToggle={(checked) =>
                    handleTranscriptToggle(version.id, checked)
                  }
                  qcLoading={qcLoading}
                  qcRefreshingDraftKey={qcRefreshingDraftKey}
                  qcResults={qcResults}
                  qcIgnored={qcIgnored}
                  onQcToggleIgnore={qcToggleIgnore}
                  onQcRefreshDraft={qcRefreshDraft}
                />
              ))
            )}
          </ScrollBody>

          {isError && (
            <Flex px="4" pb="2">
              <Callout.Root color="red" style={{ width: '100%' }}>
                <Callout.Icon>
                  <Info size={16} />
                </Callout.Icon>
                <Callout.Text>
                  {error?.message || 'Failed to publish notes'}
                </Callout.Text>
              </Callout.Root>
            </Flex>
          )}

          <FooterBar>
            <Flex justify="end" gap="3">
              <Dialog.Close>
                <Button variant="soft" color="gray" disabled={isPending}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                disabled={
                  isPending ||
                  notes.length === 0 ||
                  selectedCount === 0 ||
                  publishBlockedByQc
                }
                onClick={() => void handlePublishSelected()}
              >
                {isPending && <SpinnerIcon size={14} />}
                {isPending
                  ? 'Publishing...'
                  : `Publish selected${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </Button>
            </Flex>
          </FooterBar>
        </>
      )}
    </RegisterFlushContext.Provider>
  );
};

export const PublishNotesDialog: React.FC<PublishNotesDialogProps> = ({
  open,
  onClose,
  playlistId,
  userEmail,
  notes,
  versions = [],
}) => {
  const [isPending, setIsPending] = useState(false);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => !isOpen && !isPending && onClose()}
    >
      <Dialog.Content
        maxWidth="900px"
        style={{
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
        }}
      >
        <Dialog.Description style={{ display: 'none' }}>
          Review and publish draft notes to production tracking.
        </Dialog.Description>
        <PublishNotesTabContent
          open={open}
          onClose={onClose}
          playlistId={playlistId}
          userEmail={userEmail}
          notes={notes}
          versions={versions}
          onPendingChange={setIsPending}
          showTitle
        />
      </Dialog.Content>
    </Dialog.Root>
  );
};
