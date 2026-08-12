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
import { Loader2, Info, MoreVertical, ChevronDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { usePublishNotes } from '../hooks/usePublishNotes';
import { usePublishTranscript } from '../hooks/usePublishTranscript';
import {
  useSegments,
  usePlaylistDraftNotes,
  useVersionStatuses,
} from '../hooks';
import { apiHandler } from '../api';
import {
  useDraftNote,
  backendToLocal,
  type LocalDraftNote,
} from '../hooks/useDraftNote';
import { useNoteQCChecks } from '../hooks/useNoteQCChecks';
import {
  DraftNote,
  Version,
  SearchResult,
  NoteQCResult,
  SCRATCH_VERSION_ID,
} from '@dna/core';
import { NoteEditor, NoteDraftStatusBadges } from './NoteEditor';
import { UserAvatar } from './UserAvatar';
import { NoteQCResultPill } from './NoteQCResultPill';
import { NoteQCDiffModal } from './NoteQCDiffModal';
import { useFeatureFlags } from '../contexts';

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

const StatusRow = styled.div`
  display: flex;
  align-items: center;
  padding: 2px 0;
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
    name:
      versionId === SCRATCH_VERSION_ID
        ? 'SCRATCH PAD'
        : `Version ${versionId}`,
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
  const { aiEnabled } = useFeatureFlags();
  const registerFlush = useContext(RegisterFlushContext);
  const [fixOpen, setFixOpen] = useState(false);
  const [fixResult, setFixResult] = useState<NoteQCResult | null>(null);
  const draftKey = draftRowKey(rowDraft);

  const isScratch = version.id === SCRATCH_VERSION_ID;

  const currentVersionAsSearchResult: SearchResult | undefined = useMemo(
    () =>
      // Scratch notes link to the playlist (added on publish), never to the
      // scratch pseudo-version.
      isScratch
        ? undefined
        : {
            type: 'Version',
            id: version.id,
            name: version.name || `Version ${version.id}`,
          },
    [isScratch, version.id, version.name]
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
      {aiEnabled && (
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
      )}
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
          {aiEnabled && (
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
          )}
        </Flex>
      </Flex>
      <NoteEditor
        projectId={version.project?.id ?? null}
        currentVersion={isScratch ? null : version}
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
  const { transcriptionEnabled } = useFeatureFlags();
  const { segments, isLoading } = useSegments({ playlistId, versionId });
  const [expanded, setExpanded] = useState(false);
  const segmentsCount = segments.length;
  const speakerCount = useMemo(
    () => new Set(segments.map((s) => s.speaker).filter(Boolean)).size,
    [segments]
  );

  if (!transcriptionEnabled) return null;

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

function VersionStatusRow({
  projectId,
  currentStatus,
  value,
  checked,
  onValueChange,
  onCheckedChange,
}: {
  projectId?: number;
  currentStatus?: string;
  value: string;
  checked: boolean;
  onValueChange: (value: string) => void;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { statuses, isLoading } = useVersionStatuses({ projectId });
  const hasChange = Boolean(value) && value !== (currentStatus ?? '');
  const currentStatusName =
    statuses.find((s) => s.code === currentStatus)?.name ?? currentStatus;

  return (
    <StatusRow>
      <Flex align="center" gap="2">
        <Checkbox
          checked={hasChange && checked}
          disabled={!hasChange}
          onCheckedChange={(c) => onCheckedChange(c === true)}
        />
        <Text size="2" weight="medium" color={hasChange ? undefined : 'gray'}>
          Version Status
        </Text>
        <StatusSelectWrapper>
          <StatusSelect
            value={value}
            disabled={isLoading}
            onChange={(e) => onValueChange(e.target.value)}
          >
            {isLoading && <option value="">Loading...</option>}
            {!isLoading && !value && <option value="">Select status</option>}
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
        <Text size="1" color="gray">
          {hasChange
            ? currentStatusName
              ? `was ${currentStatusName}`
              : 'will be updated'
            : 'No change'}
        </Text>
      </Flex>
    </StatusRow>
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
  statusValue: string;
  statusChecked: boolean;
  onStatusValueChange: (value: string) => void;
  onStatusToggle: (checked: boolean) => void;
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
  statusValue,
  statusChecked,
  onStatusValueChange,
  onStatusToggle,
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

  // The scratch card publishes a note on the playlist entity: no submitter,
  // version status, or transcript.
  const isScratch = version.id === SCRATCH_VERSION_ID;

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
          {!isScratch && (
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
          )}
        </Flex>
      </VersionCardHeader>
      <Flex direction="column" gap="3" p="3">
        {!isScratch && (
          <VersionStatusRow
            projectId={version.project?.id}
            currentStatus={version.status}
            value={statusValue}
            checked={statusChecked}
            onValueChange={onStatusValueChange}
            onCheckedChange={onStatusToggle}
          />
        )}
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
        {!isScratch && (
          <VersionTranscriptRow
            playlistId={playlistId}
            versionId={version.id}
            checked={transcriptChecked}
            onCheckedChange={onTranscriptToggle}
          />
        )}
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
  const { aiEnabled } = useFeatureFlags();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [transcriptSelected, setTranscriptSelected] = useState<
    Record<number, boolean>
  >({});
  // Explicit user overrides for the per-version status rows; effective values
  // fall back to the pending status from draft notes, then the version itself.
  const [statusSelected, setStatusSelected] = useState<Record<number, boolean>>(
    {}
  );
  const [statusValues, setStatusValues] = useState<Record<number, string>>({});
  const [successSummary, setSuccessSummary] = useState<{
    publishedCount: number;
    republishedCount: number;
    failedCount: number;
    imageCount: number;
    statusCount: number;
    statusFailedCount: number;
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
  } = useNoteQCChecks({ open: open && aiEnabled, playlistId, drafts: notes });

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
      setStatusSelected({});
      setStatusValues({});
    }
  }, [open, reset]);

  // All draft notes for the playlist (not just the publishable ones passed in),
  // so pending status changes made in the main UI surface here even when the
  // draft has no note body.
  const { data: allDraftNotes = [] } = usePlaylistDraftNotes(
    open ? playlistId : null
  );

  const pendingStatusByVersion = useMemo(() => {
    const map = new Map<number, string>();
    const drafts = [...allDraftNotes].sort((a, b) => {
      const aMine = a.user_email === userEmail;
      const bMine = b.user_email === userEmail;
      if (aMine !== bMine) return aMine ? -1 : 1;
      return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
    });
    for (const d of drafts) {
      if (!d.version_status || map.has(d.version_id)) continue;
      const version = versions.find((v) => v.id === d.version_id);
      if (version && d.version_status === version.status) continue;
      map.set(d.version_id, d.version_status);
    }
    return map;
  }, [allDraftNotes, versions, userEmail]);

  const effectiveStatusValue = useCallback(
    (version: Version) =>
      statusValues[version.id] ??
      pendingStatusByVersion.get(version.id) ??
      version.status ??
      '',
    [statusValues, pendingStatusByVersion]
  );

  const isStatusChecked = useCallback(
    (version: Version) => {
      const value = effectiveStatusValue(version);
      const hasChange = Boolean(value) && value !== (version.status ?? '');
      return hasChange && (statusSelected[version.id] ?? true);
    },
    [effectiveStatusValue, statusSelected]
  );

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
  }, [open, notesFingerprint, notes]);

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
      } else if (pendingStatusByVersion.has(v.id)) {
        // Status-only change: show a card with just the status/transcript rows
        ordered.push({ version: v, drafts: [] });
        seen.add(v.id);
      }
    }

    for (const [vid, drafts] of byVid) {
      if (!seen.has(vid)) {
        ordered.push({ version: fallbackVersion(vid), drafts });
      }
    }

    // The scratch card leads, mirroring its position in the sidebar
    const scratchIndex = ordered.findIndex(
      (o) => o.version.id === SCRATCH_VERSION_ID
    );
    if (scratchIndex > 0) {
      ordered.unshift(...ordered.splice(scratchIndex, 1));
    }

    return ordered;
  }, [notes, versions, pendingStatusByVersion]);

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

  const selectedStatusCount = useMemo(
    () => versionCards.filter(({ version }) => isStatusChecked(version)).length,
    [versionCards, isStatusChecked]
  );

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

  const handleStatusValueChange = useCallback(
    (versionId: number, value: string) => {
      setStatusValues((prev) => ({ ...prev, [versionId]: value }));
      setStatusSelected((prev) => ({ ...prev, [versionId]: true }));
    },
    []
  );

  const handleStatusToggle = useCallback(
    (versionId: number, checked: boolean) => {
      setStatusSelected((prev) => ({ ...prev, [versionId]: checked }));
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
    const statusUpdates = versionCards
      .filter(({ version }) => isStatusChecked(version))
      .map(({ version }) => ({
        versionId: version.id,
        status: effectiveStatusValue(version),
        // Server clears fulfilled draft status intents for this playlist
        // without touching note publish state
        playlistId,
      }));
    if (toPublish.length === 0 && statusUpdates.length === 0) return;

    await flushAllDrafts();

    const targets = toPublish.map((d) => ({
      user_email: d.user_email,
      version_id: d.version_id,
    }));

    const selectedTranscriptVersionIds = versionCards
      .filter(
        ({ version }) =>
          version.id !== SCRATCH_VERSION_ID &&
          (transcriptSelected[version.id] ?? true)
      )
      .map(({ version }) => version.id);

    const [notesResult, transcriptResults, statusResults] = await Promise.all([
      toPublish.length > 0
        ? publishNotes({
            playlistId,
            request: {
              user_email: userEmail,
              targets,
              // Status changes are published explicitly below, gated by the
              // per-version checkboxes — suppress the implicit note-side path.
              status_version_ids: [],
            },
          })
        : Promise.resolve(null),
      Promise.allSettled(
        selectedTranscriptVersionIds.map((versionId) =>
          publishTranscriptAsync({
            playlistId,
            request: { version_id: versionId },
          })
        )
      ),
      Promise.allSettled(
        statusUpdates.map((u) => apiHandler.updateVersionStatus(u))
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
    const statusCount = statusResults.filter(
      (r) => r.status === 'fulfilled'
    ).length;

    if (statusCount > 0) {
      // Refresh version and draft data so the new statuses show up in the app
      void queryClient.invalidateQueries({ queryKey: ['versions'] });
      void queryClient.invalidateQueries({
        queryKey: ['draftNotes', playlistId],
      });
      void queryClient.invalidateQueries({ queryKey: ['draftNote'] });
    }

    setSuccessSummary({
      publishedCount: notesResult?.published_count ?? 0,
      republishedCount: notesResult?.republished_count ?? 0,
      failedCount: notesResult?.failed_count ?? 0,
      imageCount: countImages(toPublish),
      statusCount,
      statusFailedCount: statusUpdates.length - statusCount,
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
              {successSummary.statusFailedCount > 0 && (
                <li>Statuses Failed: {successSummary.statusFailedCount}</li>
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
            {versionCards.length === 0 ? (
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
                  statusValue={effectiveStatusValue(version)}
                  statusChecked={isStatusChecked(version)}
                  onStatusValueChange={(value) =>
                    handleStatusValueChange(version.id, value)
                  }
                  onStatusToggle={(checked) =>
                    handleStatusToggle(version.id, checked)
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
                  Close
                </Button>
              </Dialog.Close>
              <Button
                disabled={
                  isPending ||
                  (selectedCount === 0 && selectedStatusCount === 0) ||
                  publishBlockedByQc
                }
                onClick={() => void handlePublishSelected()}
              >
                {isPending && <SpinnerIcon size={14} />}
                {isPending
                  ? 'Publishing...'
                  : `Publish selected${
                      selectedCount + selectedStatusCount > 0
                        ? ` (${selectedCount + selectedStatusCount})`
                        : ''
                    }`}
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
