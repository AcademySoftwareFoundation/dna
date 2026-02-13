import { forwardRef, useImperativeHandle, useMemo } from 'react';
import styled from 'styled-components';
import { SearchResult, Version } from '@dna/core';
import { NoteOptionsInline } from './NoteOptionsInline';
import { MarkdownEditor } from './MarkdownEditor';
import { useDraftNote } from '../hooks';

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

const EditorWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.lg};
  flex: 1;
  min-height: 0;
`;

const EditorContent = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
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
      <EditorWrapper>
        <EditorHeader>
          <TitleRow>
            <EditorTitle>New Note</EditorTitle>
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

        <EditorContent>
          <MarkdownEditor
            value={draftNote?.content ?? ''}
            onChange={(v) => handleFieldChange('content', v)}
            placeholder="Write your notes here... (supports **markdown**)"
            minHeight={120}
          />
        </EditorContent>
      </EditorWrapper>
    );
  }
);
