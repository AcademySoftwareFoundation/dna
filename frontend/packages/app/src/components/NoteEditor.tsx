import { forwardRef, useImperativeHandle } from 'react';
import styled from 'styled-components';
import { NoteOptionsInline } from './NoteOptionsInline';
import { MarkdownEditor } from './MarkdownEditor';
import { useDraftNote } from '../hooks';

interface NoteEditorProps {
  playlistId?: number | null;
  versionId?: number | null;
  userEmail?: string | null;
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
  function NoteEditor({ playlistId, versionId, userEmail }, ref) {
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

    const handleContentChange = (value: string) => {
      updateDraftNote({ content: value });
    };

    const handleToChange = (value: string) => {
      updateDraftNote({ to: value });
    };

    const handleCcChange = (value: string) => {
      updateDraftNote({ cc: value });
    };

    const handleSubjectChange = (value: string) => {
      updateDraftNote({ subject: value });
    };

    const handleLinksChange = (value: string) => {
      updateDraftNote({ linksText: value });
    };

    const handleVersionStatusChange = (value: string) => {
      updateDraftNote({ versionStatus: value });
    };

    return (
      <EditorWrapper>
        <EditorHeader>
          <TitleRow>
            <EditorTitle>New Note</EditorTitle>
          </TitleRow>
          <NoteOptionsInline
            toValue={draftNote?.to ?? ''}
            ccValue={draftNote?.cc ?? ''}
            subjectValue={draftNote?.subject ?? ''}
            linksValue={draftNote?.linksText ?? ''}
            versionStatus={draftNote?.versionStatus ?? ''}
            onToChange={handleToChange}
            onCcChange={handleCcChange}
            onSubjectChange={handleSubjectChange}
            onLinksChange={handleLinksChange}
            onVersionStatusChange={handleVersionStatusChange}
          />
        </EditorHeader>

        <EditorContent>
          <MarkdownEditor
            value={draftNote?.content ?? ''}
            onChange={handleContentChange}
            placeholder="Write your notes here... (supports **markdown**)"
            minHeight={120}
          />
        </EditorContent>
      </EditorWrapper>
    );
  }
);
