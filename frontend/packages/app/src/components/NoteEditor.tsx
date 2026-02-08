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
    const { draftNote, updateDraftNote } = useDraftNote({
      playlistId,
      versionId,
      userEmail,
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

    // Convert current version to SearchResult for locked entity in Links
    const currentVersionAsSearchResult: SearchResult | undefined = useMemo(() => {
      if (!currentVersion) return undefined;
      return {
        type: 'Version',
        id: currentVersion.id,
        name: currentVersion.name || `Version ${currentVersion.id}`,
      };
    }, [currentVersion]);

    // Auto-populate version submitter as default To recipient
    const versionSubmitter: SearchResult | undefined = useMemo(() => {
      if (!currentVersion?.user) return undefined;
      return {
        type: 'User',
        id: currentVersion.user.id,
        name: currentVersion.user.name || '',
      };
    }, [currentVersion?.user]);

    const handleFieldChange = <K extends keyof NonNullable<typeof draftNote>>(
      key: K,
      value: NonNullable<typeof draftNote>[K]
    ) => {
      updateDraftNote({ [key]: value });
    };

    // Auto-add version submitter to To if empty and submitter exists
    const effectiveToValue = useMemo(() => {
      const toValue = draftNote?.to ?? [];
      if (toValue.length === 0 && versionSubmitter) {
        return [versionSubmitter];
      }
      return toValue;
    }, [draftNote?.to, versionSubmitter]);

    return (
      <EditorWrapper>
        <EditorHeader>
          <TitleRow>
            <EditorTitle>New Note</EditorTitle>
          </TitleRow>
          <NoteOptionsInline
            toValue={effectiveToValue}
            ccValue={draftNote?.cc ?? []}
            subjectValue={draftNote?.subject ?? ''}
            linksValue={draftNote?.links ?? []}
            versionStatus={draftNote?.versionStatus ?? ''}
            projectId={projectId ?? undefined}
            currentVersion={currentVersionAsSearchResult}
            onToChange={(v) => handleFieldChange('to', v)}
            onCcChange={(v) => handleFieldChange('cc', v)}
            onSubjectChange={(v) => handleFieldChange('subject', v)}
            onLinksChange={(v) => handleFieldChange('links', v)}
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
