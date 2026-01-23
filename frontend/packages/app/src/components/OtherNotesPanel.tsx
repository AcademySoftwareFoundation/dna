import { useState } from 'react';
import styled from 'styled-components';
import { Avatar, AlertDialog, Button, Flex, Tooltip } from '@radix-ui/themes';
import { Copy, ArrowDownToLine, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { DraftNote } from '@dna/core';
import { useOtherDraftNotes } from '../hooks';

interface OtherNotesPanelProps {
  playlistId?: number | null;
  versionId?: number | null;
  userEmail?: string | null;
  onInsertNote?: (content: string) => void;
}

const PanelWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const EmptyState = styled.div`
  padding: 24px;
  text-align: center;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const LoadingState = styled(EmptyState)`
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const NoteCard = styled.div`
  display: flex;
  gap: 12px;
  padding: 16px;
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
`;

const AvatarColumn = styled.div`
  flex-shrink: 0;
`;

const ContentColumn = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const NoteHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const UserName = styled.span`
  font-size: 13px;
  font-weight: 600;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.primary};
`;

const TimeStamp = styled.span`
  font-size: 11px;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.muted};
`;

const NoteContent = styled.div`
  font-size: 13px;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.secondary};
  line-height: 1.6;
  word-break: break-word;

  p {
    margin: 0 0 0.5em 0;
    &:last-child {
      margin-bottom: 0;
    }
  }

  h1,
  h2,
  h3,
  h4 {
    margin: 0.75em 0 0.25em 0;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text.primary};
    &:first-child {
      margin-top: 0;
    }
  }

  h1 {
    font-size: 1.4em;
  }
  h2 {
    font-size: 1.2em;
  }
  h3 {
    font-size: 1.1em;
  }

  strong {
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text.primary};
  }

  em {
    font-style: italic;
  }

  code {
    background: ${({ theme }) => theme.colors.bg.overlay};
    padding: 2px 5px;
    border-radius: 3px;
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 0.9em;
  }

  pre {
    background: ${({ theme }) => theme.colors.bg.overlay};
    padding: 10px;
    border-radius: ${({ theme }) => theme.radii.sm};
    overflow-x: auto;
    margin: 0.5em 0;

    code {
      background: transparent;
      padding: 0;
    }
  }

  blockquote {
    border-left: 3px solid ${({ theme }) => theme.colors.border.strong};
    margin: 0.5em 0;
    padding-left: 10px;
    color: ${({ theme }) => theme.colors.text.muted};
  }

  ul,
  ol {
    margin: 0.5em 0;
    padding-left: 20px;
  }

  li {
    margin-bottom: 0.25em;
  }

  hr {
    border: none;
    border-top: 1px solid ${({ theme }) => theme.colors.border.subtle};
    margin: 0.75em 0;
  }

  a {
    color: ${({ theme }) => theme.colors.accent.main};
    text-decoration: underline;
  }
`;

const NoteSubject = styled.div`
  font-size: 12px;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.muted};
  font-style: italic;
`;

const ActionBar = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 4px;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.muted};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.sm};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    border-color: ${({ theme }) => theme.colors.border.default};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DangerButton = styled(ActionButton)`
  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
  }
`;

function getInitials(email: string): string {
  const name = email.split('@')[0];
  return name
    .split(/[._-]/)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(Math.abs(diffMs) / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

interface NoteItemProps {
  note: DraftNote;
  onCopy: () => void;
  onInsert: () => void;
  onInsertAndDelete: () => void;
  isDeleting: boolean;
}

function NoteItem({
  note,
  onCopy,
  onInsert,
  onInsertAndDelete,
  isDeleting,
}: NoteItemProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleInsertAndDelete = () => {
    setShowConfirm(false);
    onInsertAndDelete();
  };

  return (
    <NoteCard>
      <AvatarColumn>
        <Avatar
          fallback={getInitials(note.user_email)}
          size="3"
          radius="full"
          variant="solid"
          color="cyan"
        />
      </AvatarColumn>
      <ContentColumn>
        <NoteHeader>
          <UserName>{note.user_email}</UserName>
          <TimeStamp>{formatTimeAgo(note.updated_at)}</TimeStamp>
        </NoteHeader>
        {note.subject && <NoteSubject>Subject: {note.subject}</NoteSubject>}
        <NoteContent>
          {note.content ? (
            <ReactMarkdown>{note.content}</ReactMarkdown>
          ) : (
            <em style={{ opacity: 0.6 }}>No content</em>
          )}
        </NoteContent>
        <ActionBar>
          <Tooltip content="Copy to clipboard">
            <ActionButton onClick={onCopy} aria-label="Copy note to clipboard">
              <Copy size={12} />
              Copy
            </ActionButton>
          </Tooltip>
          <Tooltip content="Insert below your note">
            <ActionButton
              onClick={onInsert}
              aria-label="Insert note below yours"
            >
              <ArrowDownToLine size={12} />
              Insert
            </ActionButton>
          </Tooltip>
          <AlertDialog.Root open={showConfirm} onOpenChange={setShowConfirm}>
            <Tooltip content="Insert and delete original">
              <AlertDialog.Trigger>
                <DangerButton
                  disabled={isDeleting}
                  aria-label="Insert and delete original note"
                >
                  <Trash2 size={12} />
                  Insert & Delete
                </DangerButton>
              </AlertDialog.Trigger>
            </Tooltip>
            <AlertDialog.Content maxWidth="400px">
              <AlertDialog.Title>Delete Original Note?</AlertDialog.Title>
              <AlertDialog.Description size="2">
                This will insert the note content below yours and permanently
                delete {note.user_email}&apos;s draft note. This action cannot
                be undone.
              </AlertDialog.Description>
              <Flex gap="3" mt="4" justify="end">
                <AlertDialog.Cancel>
                  <Button variant="soft" color="gray">
                    Cancel
                  </Button>
                </AlertDialog.Cancel>
                <AlertDialog.Action>
                  <Button
                    variant="solid"
                    color="red"
                    onClick={handleInsertAndDelete}
                  >
                    Insert & Delete
                  </Button>
                </AlertDialog.Action>
              </Flex>
            </AlertDialog.Content>
          </AlertDialog.Root>
        </ActionBar>
      </ContentColumn>
    </NoteCard>
  );
}

export function OtherNotesPanel({
  playlistId,
  versionId,
  userEmail,
  onInsertNote,
}: OtherNotesPanelProps) {
  const { otherNotes, isLoading, deleteOtherNote, isDeleting } =
    useOtherDraftNotes({
      playlistId,
      versionId,
      currentUserEmail: userEmail,
    });

  const handleCopy = async (note: DraftNote) => {
    try {
      await navigator.clipboard.writeText(note.content);
    } catch {
      console.error('Failed to copy to clipboard');
    }
  };

  const handleInsert = (note: DraftNote) => {
    onInsertNote?.(note.content);
  };

  const handleInsertAndDelete = async (note: DraftNote) => {
    onInsertNote?.(note.content);
    await deleteOtherNote(note.user_email);
  };

  if (isLoading) {
    return (
      <PanelWrapper>
        <LoadingState>Loading notes from other users...</LoadingState>
      </PanelWrapper>
    );
  }

  if (otherNotes.length === 0) {
    return (
      <PanelWrapper>
        <EmptyState>No notes from other users yet</EmptyState>
      </PanelWrapper>
    );
  }

  return (
    <PanelWrapper>
      {otherNotes.map((note) => (
        <NoteItem
          key={note._id}
          note={note}
          onCopy={() => handleCopy(note)}
          onInsert={() => handleInsert(note)}
          onInsertAndDelete={() => handleInsertAndDelete(note)}
          isDeleting={isDeleting}
        />
      ))}
    </PanelWrapper>
  );
}
