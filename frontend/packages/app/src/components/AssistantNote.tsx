import styled, { keyframes } from 'styled-components';
import { Tooltip } from '@radix-ui/themes';
import { Bot, MessageSquare, Copy, ArrowDownToLine, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { SplitButton } from './SplitButton';

interface AssistantNoteProps {
  suggestion?: string | null;
  isLoading?: boolean;
  error?: Error | null;
  onRegenerate?: () => void;
  onInsertNote?: (content: string) => void;
}

const NoteCard = styled.div`
  display: flex;
  gap: 12px;
  padding: 16px;
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
`;

const IconColumn = styled.div`
  flex-shrink: 0;
`;

const BotIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: linear-gradient(
    135deg,
    ${({ theme }) => theme.colors.accent.main} 0%,
    ${({ theme }) => theme.colors.accent.subtle} 100%
  );
  border-radius: ${({ theme }) => theme.radii.full};
  color: white;
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

const NoteTitle = styled.span`
  font-size: 13px;
  font-weight: 600;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.primary};
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

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const EmptyState = styled.div`
  padding: 24px;
  text-align: center;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const ActionBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 4px;
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

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.colors.text.primary};
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    border-color: ${({ theme }) => theme.colors.border.default};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const SpinnerIcon = styled(Loader2)`
  animation: ${spin} 1s linear infinite;
`;

const LoadingState = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const ErrorState = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.status.error};
`;

export function AssistantNote({
  suggestion,
  isLoading = false,
  error,
  onRegenerate,
  onInsertNote,
}: AssistantNoteProps) {
  const handleCopy = async () => {
    if (!suggestion) return;
    try {
      await navigator.clipboard.writeText(suggestion);
    } catch {
      console.error('Failed to copy to clipboard');
    }
  };

  const handleInsert = () => {
    if (!suggestion) return;
    onInsertNote?.(suggestion);
  };

  const handleRegenerate = () => {
    onRegenerate?.();
  };

  const hasSuggestion = suggestion != null && suggestion.length > 0;
  const showEmptyState = !hasSuggestion && !isLoading && !error;

  return (
    <NoteCard>
      <IconColumn>
        <BotIcon>
          <Bot size={20} />
        </BotIcon>
      </IconColumn>
      <ContentColumn>
        <NoteHeader>
          <NoteTitle>AI Assistant</NoteTitle>
          <SplitButton
            rightSlot={
              isLoading ? <SpinnerIcon size={14} /> : <MessageSquare size={14} />
            }
            onClick={handleRegenerate}
            disabled={isLoading}
          >
            {isLoading ? 'Generating...' : 'Regenerate'}
          </SplitButton>
        </NoteHeader>

        {isLoading && (
          <LoadingState>
            <SpinnerIcon size={16} />
            Generating note suggestion...
          </LoadingState>
        )}

        {error && !isLoading && (
          <ErrorState>
            Failed to generate note: {error.message}
          </ErrorState>
        )}

        {showEmptyState && (
          <EmptyState>
            No note has been generated yet. Click Regenerate to create an AI-powered note suggestion.
          </EmptyState>
        )}

        {hasSuggestion && !isLoading && (
          <>
            <NoteContent>
              <ReactMarkdown>{suggestion}</ReactMarkdown>
            </NoteContent>
            <ActionBar>
              <ActionButtons>
                <Tooltip content="Copy to clipboard">
                  <ActionButton
                    onClick={handleCopy}
                    aria-label="Copy note to clipboard"
                  >
                    <Copy size={12} />
                    Copy
                  </ActionButton>
                </Tooltip>
                <Tooltip content="Insert below your note">
                  <ActionButton
                    onClick={handleInsert}
                    aria-label="Insert note below yours"
                  >
                    <ArrowDownToLine size={12} />
                    Insert
                  </ActionButton>
                </Tooltip>
              </ActionButtons>
            </ActionBar>
          </>
        )}
      </ContentColumn>
    </NoteCard>
  );
}
