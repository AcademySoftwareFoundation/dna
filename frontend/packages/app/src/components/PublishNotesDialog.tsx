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
import { useDraftNote } from '../hooks/useDraftNote';
import { DraftNote, Version, SearchResult } from '@dna/core';
import { NoteEditor, NoteDraftStatusBadges } from './NoteEditor';
import { UserAvatar } from './UserAvatar';

interface PublishNotesDialogProps {
  open: boolean;
  onClose: () => void;
  playlistId: number;
  userEmail: string;
  notes: DraftNote[];
  versions?: Version[];
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

const RegisterFlushContext = createContext<(fn: () => Promise<void>) => () => void>(
  () => () => {}
);

interface PublishNoteRowProps {
  playlistId: number;
  version: Version;
  draftOwnerEmail: string;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
}

function PublishNoteRow({
  playlistId,
  version,
  draftOwnerEmail,
  selected,
  onSelectedChange,
}: PublishNoteRowProps) {
  const registerFlush = useContext(RegisterFlushContext);

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

  const versionDisplayName = version.name || `Version ${version.id}`;
  const title = `${displayNameFromEmail(draftOwnerEmail)}'s note on ${versionDisplayName}`;

  return (
    <NoteRowBlock>
      <Flex align="center" gap="3" mb="3" wrap="wrap" style={{ width: '100%' }}>
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
        </Flex>
      </Flex>
      <NoteEditor
        projectId={version.project?.id ?? null}
        currentVersion={version}
        draftNote={draftNote}
        updateDraftNote={updateDraftNote}
        saveAttachmentIds={saveAttachmentIds}
        variant="embedded"
      />
    </NoteRowBlock>
  );
}

interface VersionPublishCardProps {
  playlistId: number;
  version: Version;
  drafts: DraftNote[];
  currentUserEmail: string;
  selected: Record<string, boolean>;
  onToggle: (key: string, checked: boolean) => void;
}

function VersionPublishCard({
  playlistId,
  version,
  drafts,
  currentUserEmail,
  selected,
  onToggle,
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
          <Text weight="bold" size="2" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
      <Flex direction="column" gap="4" p="3">
        {sortedDrafts.map((d) => (
          <PublishNoteRow
            key={draftRowKey(d)}
            playlistId={playlistId}
            version={version}
            draftOwnerEmail={d.user_email}
            selected={selected[draftRowKey(d)] ?? false}
            onSelectedChange={(c) => onToggle(draftRowKey(d), c)}
          />
        ))}
      </Flex>
    </VersionCard>
  );
}

export const PublishNotesDialog: React.FC<PublishNotesDialogProps> = ({
  open,
  onClose,
  playlistId,
  userEmail,
  notes,
  versions = [],
}) => {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [publishedImageCount, setPublishedImageCount] = useState(0);
  const [publishedStatusCount, setPublishedStatusCount] = useState(0);
  const { mutate: publishNotes, isPending, isError, error, data, reset } = usePublishNotes();

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
    if (open) {
      reset();
      setPublishedImageCount(0);
      setPublishedStatusCount(0);
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

  const selectedCount = useMemo(
    () => notes.filter((d) => selected[draftRowKey(d)]).length,
    [notes, selected]
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
    (mode: 'all' | 'mine' | 'others') => {
      setSelected(() => {
        const next: Record<string, boolean> = {};
        for (const d of notes) {
          const k = draftRowKey(d);
          if (mode === 'all') next[k] = true;
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

  const handlePublishSelected = async () => {
    const toPublish = notes.filter((d) => selected[draftRowKey(d)]);
    if (toPublish.length === 0) return;

    await flushAllDrafts();

    const targets = toPublish.map((d) => ({
      user_email: d.user_email,
      version_id: d.version_id,
    }));

    setPublishedImageCount(countImages(toPublish));
    setPublishedStatusCount(countStatuses(toPublish));

    publishNotes(
      {
        playlistId,
        request: {
          user_email: userEmail,
          targets,
        },
      }
    );
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && !isPending && handleClose()}>
      <Dialog.Content maxWidth="900px" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        <RegisterFlushContext.Provider value={registerFlush}>
          <Dialog.Description style={{ display: 'none' }}>
            Review and publish draft notes to production tracking.
          </Dialog.Description>
          {data ? (
            <Flex direction="column" gap="4" p="4">
              <Dialog.Title style={{ margin: 0 }}>Publish Notes</Dialog.Title>
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
                  {data.published_count > 0 && <li>Notes Published: {data.published_count}</li>}
                  {data.republished_count > 0 && (
                    <li>Notes Republished: {data.republished_count}</li>
                  )}
                  {publishedImageCount > 0 && <li>Images Attached: {publishedImageCount}</li>}
                  {publishedStatusCount > 0 && <li>Statuses Updated: {publishedStatusCount}</li>}
                  {data.failed_count > 0 && <li>Notes Failed: {data.failed_count}</li>}
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
                justify="between"
                gap="3"
                p="4"
                style={{
                  borderBottom: '1px solid var(--gray-a6)',
                  flexShrink: 0,
                }}
              >
                <Dialog.Title style={{ margin: 0 }}>Publish Notes</Dialog.Title>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
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
                    <DropdownMenu.Item onSelect={() => handleBatchSelect('all')}>
                      Select all notes
                    </DropdownMenu.Item>
                    <DropdownMenu.Item onSelect={() => handleBatchSelect('mine')}>
                      Select only my notes
                    </DropdownMenu.Item>
                    <DropdownMenu.Item onSelect={() => handleBatchSelect('others')}>
                      Select only notes from others
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
                    <Callout.Text>{error?.message || 'Failed to publish notes'}</Callout.Text>
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
                      selectedCount === 0
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
      </Dialog.Content>
    </Dialog.Root>
  );
};
