import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import styled from 'styled-components';
import { X, Image } from 'lucide-react';
import { SearchResult, Version } from '@dna/core';
import { NoteOptionsInline } from './NoteOptionsInline';
import { MarkdownEditor } from './MarkdownEditor';
import { MentionIndexProvider } from '../contexts/MentionIndexContext';
import type { LocalDraftNote } from '../hooks';
import { apiHandler } from '../api';

export interface StagedAttachment {
  id: string;
  /** Undefined for server-loaded attachments (file is not re-downloaded). */
  file?: File;
  previewUrl: string;
  backendId?: string;
}

interface NoteEditorProps {
  projectId?: number | null;
  currentVersion?: Version | null;
  draftNote: LocalDraftNote | null;
  updateDraftNote: (updates: Partial<LocalDraftNote>) => void;
  saveAttachmentIds: (ids: string[]) => Promise<void>;
  /** Omits outer border and uses inset highlight on drag-over (e.g. publish dialog). */
  variant?: 'default' | 'embedded';
}

export interface NoteEditorHandle {
  appendContent: (content: string) => void;
}

const DEFAULT_HEIGHT = 140;
const MIN_HEIGHT = 60;

const EditorWrapper = styled.div<{
  $height: number;
  $isDragOver: boolean;
  $embedded?: boolean;
}>`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  padding-bottom: 8px;
  background: ${({ theme }) => theme.colors.bg.surface};
  border: ${({ $embedded, $isDragOver, theme }) =>
    $embedded
      ? 'none'
      : `1px solid ${
          $isDragOver ? theme.colors.accent.main : theme.colors.border.subtle
        }`};
  box-shadow: ${({ $embedded, $isDragOver, theme }) =>
    $embedded && $isDragOver ? `inset 0 0 0 2px ${theme.colors.accent.main}` : 'none'};
  border-radius: ${({ theme }) => theme.radii.lg};
  transition: border-color ${({ theme }) => theme.transitions.fast},
    box-shadow ${({ theme }) => theme.transitions.fast};
`;

const EditorContent = styled.div<{ $height: number }>`
  display: flex;
  flex-direction: column;
  height: ${({ $height }) => $height}px;
  min-height: ${MIN_HEIGHT}px;
`;

const EditorHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
`;

const EditorTitle = styled.h2`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.primary};
  flex-shrink: 0;
`;

const StatusBadge = styled.div<{
  $isWarning?: boolean;
  $isDraft?: boolean;
  $compact?: boolean;
}>`
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background-color: ${({ theme, $isWarning, $isDraft }) => {
    const color = $isDraft
      ? theme.colors.status.info
      : $isWarning
        ? theme.colors.status.warning
        : theme.colors.status.success;
    return color + '20';
  }};
  color: ${({ theme, $isWarning, $isDraft }) =>
    $isDraft
      ? theme.colors.status.info
      : $isWarning
        ? theme.colors.status.warning
        : theme.colors.status.success};
  margin-left: ${({ $compact }) => ($compact ? '0' : '12px')};
`;

const InlineBadgeWrap = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
`;

export type NoteDraftStatusFields = Pick<
  LocalDraftNote,
  'published' | 'publishedNoteId' | 'content' | 'subject'
>;

export function NoteDraftStatusBadges({
  draft,
  layout = 'title',
}: {
  draft: NoteDraftStatusFields | null;
  layout?: 'title' | 'inline';
}) {
  if (!draft) return null;

  const showPublished = draft.published;
  const showEdited = !draft.published && Boolean(draft.publishedNoteId);
  const showDraftBadge =
    !draft.published &&
    !draft.publishedNoteId &&
    Boolean(draft.content || draft.subject);

  if (!showPublished && !showEdited && !showDraftBadge) return null;

  const compact = layout === 'inline';

  const badges = (
    <>
      {showPublished && (
        <StatusBadge $compact={compact}>Published</StatusBadge>
      )}
      {showEdited && (
        <StatusBadge $isWarning $compact={compact}>
          Published (Edited)
        </StatusBadge>
      )}
      {showDraftBadge && (
        <StatusBadge $isDraft $compact={compact}>
          Draft
        </StatusBadge>
      )}
    </>
  );

  if (layout === 'inline') {
    return <InlineBadgeWrap>{badges}</InlineBadgeWrap>;
  }

  return <>{badges}</>;
}

const DropOverlay = styled.div`
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: ${({ theme }) => theme.colors.accent.subtle};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.accent.main};
  z-index: 1;
`;

const AttachmentTray = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: ${({ theme }) => theme.colors.bg.base};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.md};
`;

const AttachmentTrayHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const AttachmentTrayTitle = styled.span`
  font-size: 13px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const AttachmentTrayClose = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.colors.text.muted};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const ThumbnailGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const ThumbnailBox = styled.div`
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  overflow: visible;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
    display: block;
  }
`;

const RemoveButton = styled.button`
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.bg.overlay};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  color: ${({ theme }) => theme.colors.text.secondary};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    color: ${({ theme }) => theme.colors.text.primary};
    border-color: ${({ theme }) => theme.colors.border.strong};
  }
`;

const ResizeHandle = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 12px;
  cursor: ns-resize;
  flex-shrink: 0;
  border-radius: 0 0 ${({ theme }) => theme.radii.lg}
    ${({ theme }) => theme.radii.lg};
  color: ${({ theme }) => theme.colors.border.default};
  transition: color ${({ theme }) => theme.transitions.fast};

  &:hover {
    color: ${({ theme }) => theme.colors.border.strong};
  }

  &::before {
    content: '';
    display: block;
    width: 32px;
    height: 3px;
    border-radius: 2px;
    background: currentColor;
  }
`;

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(
  function NoteEditor(
    {
      projectId,
      currentVersion,
      draftNote,
      updateDraftNote,
      saveAttachmentIds,
      variant = 'default',
    },
    ref
  ) {
    const isEmbedded = variant === 'embedded';

    const currentVersionAsSearchResult: SearchResult | undefined =
      useMemo(() => {
        if (!currentVersion) return undefined;
        return {
          type: 'Version',
          id: currentVersion.id,
          name: currentVersion.name || `Version ${currentVersion.id}`,
        };
      }, [currentVersion]);

    const versionSubmitter: SearchResult | undefined = useMemo(() => {
      if (!currentVersion?.user) return undefined;
      return {
        type: 'User',
        id: currentVersion.user.id,
        name: currentVersion.user.name || '',
      };
    }, [currentVersion?.user]);

    const [editorHeight, setEditorHeight] = useState(DEFAULT_HEIGHT);
    const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
    const [isAttachmentTrayOpen, setIsAttachmentTrayOpen] = useState(false);
    const [attachFlashKey, setAttachFlashKey] = useState(0);
    const [animatePill, setAnimatePill] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);

    const attachmentsRef = useRef<StagedAttachment[]>([]);
    const attachmentsByVersion = useRef<
      Map<number | null | undefined, StagedAttachment[]>
    >(new Map());
    const versionIdRef = useRef(currentVersion?.id);

    // Restore per-version attachments when version changes
    useEffect(() => {
      versionIdRef.current = currentVersion?.id;
      const saved = attachmentsByVersion.current.get(currentVersion?.id) ?? [];
      attachmentsRef.current = saved;
      setAttachments(saved);
      setIsAttachmentTrayOpen(false);
      setAnimatePill(false);
    }, [currentVersion?.id]);

    // Auto-close tray when all attachments are removed
    useEffect(() => {
      if (attachments.length === 0) setIsAttachmentTrayOpen(false);
    }, [attachments.length]);

    // Sync server-saved attachment IDs into local state so previously uploaded
    // images are visible when the editor mounts or a different draft is loaded.
    const attachmentIdsKey = draftNote?.attachmentIds?.join(',') ?? '';
    useEffect(() => {
      const serverIds = draftNote?.attachmentIds ?? [];
      if (!serverIds.length) return;
      const existingBackendIds = new Set(
        attachmentsRef.current.map((a) => a.backendId).filter(Boolean)
      );
      const newIds = serverIds.filter((id) => !existingBackendIds.has(id));
      if (!newIds.length) return;
      const newEntries: StagedAttachment[] = newIds.map((id) => ({
        id,
        previewUrl: apiHandler.getAttachmentUrl(id),
        backendId: id,
      }));
      const next = [...attachmentsRef.current, ...newEntries];
      attachmentsRef.current = next;
      attachmentsByVersion.current.set(versionIdRef.current, next);
      setAttachments(next);
      setIsAttachmentTrayOpen(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attachmentIdsKey, currentVersion?.id]);

    const handleAttach = useCallback(
      async (file: File) => {
        const previewUrl = URL.createObjectURL(file);
        const localId = crypto.randomUUID();
        const staged: StagedAttachment = { id: localId, file, previewUrl };
        const next = [...attachmentsRef.current, staged];
        attachmentsRef.current = next;
        attachmentsByVersion.current.set(versionIdRef.current, next);
        setAttachments(next);
        setAnimatePill(true);
        setAttachFlashKey((k) => k + 1);

        const result = await apiHandler.uploadAttachment(file);

        // Patch backendId onto the staged entry
        const updated = attachmentsRef.current.map((a) =>
          a.id === localId ? { ...a, backendId: result.id } : a
        );
        attachmentsRef.current = updated;
        attachmentsByVersion.current.set(versionIdRef.current, updated);
        setAttachments(updated);

        const allBackendIds = updated
          .map((a) => a.backendId)
          .filter((id): id is string => Boolean(id));
        await saveAttachmentIds(allBackendIds);
      },
      [saveAttachmentIds]
    );

    const handleRemoveAttachment = useCallback(
      async (id: string) => {
        const removed = attachmentsRef.current.find((a) => a.id === id);
        if (removed) {
          URL.revokeObjectURL(removed.previewUrl);
          if (removed.backendId) {
            try {
              await apiHandler.deleteAttachment(removed.backendId);
            } catch {
              // File may already be gone (e.g. after publishing) — still remove from UI
            }
          }
        }
        const next = attachmentsRef.current.filter((a) => a.id !== id);
        attachmentsRef.current = next;
        attachmentsByVersion.current.set(versionIdRef.current, next);
        setAttachments(next);

        const allBackendIds = next
          .map((a) => a.backendId)
          .filter((id): id is string => Boolean(id));
        await saveAttachmentIds(allBackendIds);
      },
      [saveAttachmentIds]
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.types.includes('Files')) setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node))
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        Array.from(e.dataTransfer.files)
          .filter((f) => f.type.startsWith('image/'))
          .forEach(handleAttach);
      },
      [handleAttach]
    );

    const handlePaste = useCallback(
      (e: React.ClipboardEvent) => {
        const images = Array.from(e.clipboardData.items)
          .filter((item) => item.type.startsWith('image/'))
          .map((item) => item.getAsFile())
          .filter((f): f is File => f !== null);
        if (images.length === 0) return;
        e.preventDefault();
        images.forEach(handleAttach);
      },
      [handleAttach]
    );

    // Revoke all object URLs on unmount
    useEffect(() => {
      const byVersion = attachmentsByVersion.current;
      return () => {
        byVersion.forEach((list) =>
          list.forEach((a) => URL.revokeObjectURL(a.previewUrl))
        );
      };
    }, []);

    const dragStartY = useRef<number>(0);
    const dragStartHeight = useRef<number>(DEFAULT_HEIGHT);

    const handleResizeMouseDown = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        dragStartY.current = e.clientY;
        dragStartHeight.current = editorHeight;

        const onMouseMove = (moveEvent: MouseEvent) => {
          const delta = moveEvent.clientY - dragStartY.current;
          const newHeight = Math.max(
            MIN_HEIGHT,
            dragStartHeight.current + delta
          );
          setEditorHeight(newHeight);
        };

        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        };

        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      },
      [editorHeight]
    );

    useImperativeHandle(
      ref,
      () => ({
        appendContent: (content: string) => {
          const currentContent = draftNote?.content ?? '';
          const separator = currentContent.trim() ? '\n\n---\n\n' : '';
          updateDraftNote({ content: currentContent + separator + content });
        },
      }),
      [draftNote?.content, updateDraftNote]
    );

    const handleFieldChange = <K extends keyof NonNullable<typeof draftNote>>(
      key: K,
      value: NonNullable<typeof draftNote>[K]
    ) => {
      updateDraftNote({ [key]: value });
    };

    // The submitter is stored in draftNote.to but shown as a locked (non-removable)
    // entity. Filter it from the editable portion and re-add it on save.
    const editableTo = useMemo(() => {
      return (draftNote?.to ?? []).filter(
        (u) =>
          !(
            versionSubmitter &&
            u.id === versionSubmitter.id &&
            u.type === versionSubmitter.type
          )
      );
    }, [draftNote?.to, versionSubmitter]);

    // The current version is stored in draftNote.links but displayed separately
    // as a locked (non-removable) entity. Filter it from the editable portion to
    // avoid showing it twice, and re-add it whenever links are saved.
    const editableLinks = useMemo(() => {
      return (draftNote?.links ?? []).filter(
        (l) =>
          !(
            currentVersionAsSearchResult &&
            l.id === currentVersionAsSearchResult.id &&
            l.type === currentVersionAsSearchResult.type
          )
      );
    }, [draftNote?.links, currentVersionAsSearchResult]);

    // When a @mention is inserted in the editor, sync it to the properties panel.
    // Users → CC field; everything else → Links field. Duplicates are skipped.
    const handleMentionInsert = useCallback(
      (entity: SearchResult) => {
        if (entity.type.toLowerCase() === 'user') {
          const currentCc = draftNote?.cc ?? [];
          if (
            !currentCc.some((e) => e.id === entity.id && e.type === entity.type)
          ) {
            handleFieldChange('cc', [...currentCc, entity]);
          }
        } else {
          const fullLinks = draftNote?.links ?? [];
          if (
            !fullLinks.some((e) => e.id === entity.id && e.type === entity.type)
          ) {
            handleFieldChange('links', [...fullLinks, entity]);
          }
        }
      },
      [draftNote?.cc, draftNote?.links, handleFieldChange]
    );

    return (
      <MentionIndexProvider projectId={projectId ?? null}>
        <EditorWrapper
          $height={editorHeight}
          $isDragOver={isDragOver}
          $embedded={variant === 'embedded'}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPaste={handlePaste}
        >
          {isDragOver && (
            <DropOverlay>
              <Image size={32} />
            </DropOverlay>
          )}
          <EditorHeader>
            {!isEmbedded && (
              <TitleRow>
                <EditorTitle>Notes</EditorTitle>
                <NoteDraftStatusBadges draft={draftNote} layout="title" />
              </TitleRow>
            )}
            <NoteOptionsInline
              toValue={editableTo}
              ccValue={draftNote?.cc ?? []}
              subjectValue={draftNote?.subject ?? ''}
              linksValue={editableLinks}
              projectId={projectId ?? undefined}
              currentVersion={currentVersionAsSearchResult}
              lockedTo={versionSubmitter ? [versionSubmitter] : []}
              onToChange={(v) => {
                const to = versionSubmitter ? [versionSubmitter, ...v] : v;
                handleFieldChange('to', to);
              }}
              onCcChange={(v) => handleFieldChange('cc', v)}
              onSubjectChange={(v) => handleFieldChange('subject', v)}
              onLinksChange={(v) => {
                const links = currentVersionAsSearchResult
                  ? [currentVersionAsSearchResult, ...v]
                  : v;
                handleFieldChange('links', links);
              }}
            />
          </EditorHeader>

          <EditorContent $height={editorHeight}>
            <MarkdownEditor
              value={draftNote?.content ?? ''}
              onChange={(v) => handleFieldChange('content', v)}
              onAttach={handleAttach}
              attachmentCount={attachments.length}
              attachmentFlashKey={attachFlashKey}
              animatePill={animatePill}
              onToggleAttachmentTray={() => setIsAttachmentTrayOpen((o) => !o)}
              placeholder="Write your notes here... (supports **markdown**, type @ to mention)"
              minHeight={MIN_HEIGHT}
              projectId={projectId}
              onMentionInsert={handleMentionInsert}
            />
          </EditorContent>

          {isAttachmentTrayOpen && (
            <AttachmentTray>
              <AttachmentTrayHeader>
                <AttachmentTrayTitle>Images</AttachmentTrayTitle>
                <AttachmentTrayClose
                  onClick={() => setIsAttachmentTrayOpen(false)}
                >
                  <X size={14} />
                </AttachmentTrayClose>
              </AttachmentTrayHeader>
              <ThumbnailGrid>
                {attachments.map((a) => {
                  const displayName = a.file?.name ?? a.backendId ?? '';
                  return (
                    <ThumbnailBox key={a.id}>
                      <img
                        src={a.previewUrl}
                        alt={displayName}
                        title={displayName}
                      />
                      <RemoveButton
                        onClick={() => handleRemoveAttachment(a.id)}
                        title="Remove attachment"
                      >
                        <X size={10} />
                      </RemoveButton>
                    </ThumbnailBox>
                  );
                })}
              </ThumbnailGrid>
            </AttachmentTray>
          )}

          <ResizeHandle
            onMouseDown={handleResizeMouseDown}
            title="Drag to resize"
          />
        </EditorWrapper>
      </MentionIndexProvider>
    );
  }
);
