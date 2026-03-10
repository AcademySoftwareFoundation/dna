import { forwardRef, useImperativeHandle, useMemo, useState, useRef, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { X, Image } from 'lucide-react';
import { SearchResult, Version } from '@dna/core';
import { NoteOptionsInline } from './NoteOptionsInline';
import { MarkdownEditor } from './MarkdownEditor';
import { useDraftNote } from '../hooks';

export interface StagedAttachment {
  id: string;
  file: File;
  previewUrl: string;
}

interface NoteEditorProps {
  playlistId?: number | null;
  versionId?: number | null;
  userEmail?: string | null;
  projectId?: number | null;
  currentVersion?: Version | null;
}

export interface NoteEditorHandle {
  appendContent: (content: string) => void;
}

const DEFAULT_HEIGHT = 280;
const MIN_HEIGHT = 120;

const EditorWrapper = styled.div<{ $height: number; $isDragOver: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  padding-bottom: 8px;
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ $isDragOver, theme }) =>
    $isDragOver ? theme.colors.accent.main : theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.lg};
  transition: border-color ${({ theme }) => theme.transitions.fast};
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

const StatusBadge = styled.div<{ $isWarning?: boolean }>`
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background-color: ${({ theme, $isWarning }) => {
    const color = $isWarning
      ? theme.colors.status.warning
      : theme.colors.status.success;
    return color + '20'; // 12% opacity (hex)
  }};
  color: ${({ theme, $isWarning }) =>
    $isWarning ? theme.colors.status.warning : theme.colors.status.success};
  margin-left: 12px;
`;

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
  border-radius: 0 0 ${({ theme }) => theme.radii.lg} ${({ theme }) => theme.radii.lg};
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
    { playlistId, versionId, userEmail, projectId, currentVersion },
    ref
  ) {
    // Derive SearchResult representations first so they can seed the draft
    const currentVersionAsSearchResult: SearchResult | undefined = useMemo(() => {
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

    const { draftNote, updateDraftNote } = useDraftNote({
      playlistId,
      versionId,
      userEmail,
      currentVersion: currentVersionAsSearchResult,
      submitter: versionSubmitter,
    });

    const [editorHeight, setEditorHeight] = useState(DEFAULT_HEIGHT);
    const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
    const [isAttachmentTrayOpen, setIsAttachmentTrayOpen] = useState(false);
    const [attachFlashKey, setAttachFlashKey] = useState(0);
    const [isDragOver, setIsDragOver] = useState(false);

    const attachmentsRef = useRef<StagedAttachment[]>([]);
    const attachmentsByVersion = useRef<Map<number | null | undefined, StagedAttachment[]>>(new Map());
    const versionIdRef = useRef(versionId);

    // Restore per-version attachments when versionId changes
    useEffect(() => {
      versionIdRef.current = versionId;
      const saved = attachmentsByVersion.current.get(versionId) ?? [];
      attachmentsRef.current = saved;
      setAttachments(saved);
      setIsAttachmentTrayOpen(false);
    }, [versionId]);

    // Auto-close tray when all attachments are removed
    useEffect(() => {
      if (attachments.length === 0) setIsAttachmentTrayOpen(false);
    }, [attachments.length]);

    const handleAttach = useCallback((file: File) => {
      const previewUrl = URL.createObjectURL(file);
      const next = [...attachmentsRef.current, { id: crypto.randomUUID(), file, previewUrl }];
      attachmentsRef.current = next;
      attachmentsByVersion.current.set(versionIdRef.current, next);
      setAttachments(next);
      setIsAttachmentTrayOpen(true);
      setAttachFlashKey(k => k + 1);
    }, []);

    const handleRemoveAttachment = useCallback((id: string) => {
      const removed = attachmentsRef.current.find(a => a.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      const next = attachmentsRef.current.filter(a => a.id !== id);
      attachmentsRef.current = next;
      attachmentsByVersion.current.set(versionIdRef.current, next);
      setAttachments(next);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.types.includes('Files')) setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        Array.from(e.dataTransfer.files)
          .filter(f => f.type.startsWith('image/'))
          .forEach(handleAttach);
      },
      [handleAttach]
    );

    const handlePaste = useCallback(
      (e: React.ClipboardEvent) => {
        const images = Array.from(e.clipboardData.items)
          .filter(item => item.type.startsWith('image/'))
          .map(item => item.getAsFile())
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
        byVersion.forEach(list => list.forEach(a => URL.revokeObjectURL(a.previewUrl)));
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
          const newHeight = Math.max(MIN_HEIGHT, dragStartHeight.current + delta);
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

    return (
      <EditorWrapper
        $height={editorHeight}
        $isDragOver={isDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        {isDragOver && <DropOverlay><Image size={32} /></DropOverlay>}
        <EditorHeader>
          <TitleRow>
            <EditorTitle>New Note</EditorTitle>
            {draftNote?.published && <StatusBadge>Published</StatusBadge>}
            {!draftNote?.published && draftNote?.publishedNoteId && (
              <StatusBadge $isWarning>Published (Edited)</StatusBadge>
            )}
          </TitleRow>
          <NoteOptionsInline
            toValue={editableTo}
            ccValue={draftNote?.cc ?? []}
            subjectValue={draftNote?.subject ?? ''}
            linksValue={editableLinks}
            versionStatus={draftNote?.versionStatus ?? ''}
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
            onVersionStatusChange={(v) => handleFieldChange('versionStatus', v)}
          />
        </EditorHeader>

        <EditorContent $height={editorHeight}>
          <MarkdownEditor
            value={draftNote?.content ?? ''}
            onChange={(v) => handleFieldChange('content', v)}
            onAttach={handleAttach}
            attachmentCount={attachments.length}
            attachmentFlashKey={attachFlashKey}
            onToggleAttachmentTray={() => setIsAttachmentTrayOpen(o => !o)}
            placeholder="Write your notes here... (supports **markdown**)"
            minHeight={MIN_HEIGHT}
          />
        </EditorContent>

        {isAttachmentTrayOpen && (
          <AttachmentTray>
            <AttachmentTrayHeader>
              <AttachmentTrayTitle>Attached Images</AttachmentTrayTitle>
              <AttachmentTrayClose onClick={() => setIsAttachmentTrayOpen(false)}>
                <X size={14} />
              </AttachmentTrayClose>
            </AttachmentTrayHeader>
            <ThumbnailGrid>
              {attachments.map(a => (
                <ThumbnailBox key={a.id}>
                  <img src={a.previewUrl} alt={a.file.name} title={a.file.name} />
                  <RemoveButton onClick={() => handleRemoveAttachment(a.id)} title="Remove attachment">
                    <X size={10} />
                  </RemoveButton>
                </ThumbnailBox>
              ))}
            </ThumbnailGrid>
          </AttachmentTray>
        )}

        <ResizeHandle onMouseDown={handleResizeMouseDown} title="Drag to resize" />
      </EditorWrapper>
    );
  }
);
