import { useState, useRef, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { Tooltip } from '@radix-ui/themes';
import { useHotkeyConfig } from '../hotkeys';
import {
  Bot,
  MessageSquare,
  Copy,
  ArrowDownToLine,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { SplitButton } from './SplitButton';

interface AssistantNoteProps {
  suggestion?: string | null;
  isLoading?: boolean;
  error?: Error | null;
  onRegenerate?: (additionalInstructions?: string) => void;
  onInsertNote?: (content: string) => void;
  historyCount?: number;
  activeOrdinal?: number | null;
  canGoPrevious?: boolean;
  canGoNext?: boolean;
  onPreviousVersion?: () => void;
  onNextVersion?: () => void;
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

const BottomToolbar = styled.div`
  display: flex;
  align-items: center;
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

const InstructionsInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.bg.overlay};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.sm};
  outline: none;
  transition: border-color ${({ theme }) => theme.transitions.fast};

  &:focus {
    border-color: ${({ theme }) => theme.colors.accent.main};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.muted};
  }
`;

const VersionNav = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
  margin-left: auto;
`;

const VersionNavIndex = styled.span`
  font-size: 13px;
  font-weight: 600;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.primary};
  min-width: 1.5ch;
  text-align: center;
`;

const VersionChevronButton = styled.button<{ $atLimit: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  background: transparent;
  cursor: ${({ $atLimit }) => ($atLimit ? 'default' : 'pointer')};
  color: ${({ theme, $atLimit }) =>
    $atLimit ? theme.colors.text.muted : theme.colors.text.secondary};
  opacity: ${({ $atLimit }) => ($atLimit ? 0.5 : 1)};
  transition: opacity ${({ theme }) => theme.transitions.fast},
    color ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.colors.text.primary};
    opacity: 1;
  }
`;

export function AssistantNote({
  suggestion,
  isLoading = false,
  error,
  onRegenerate,
  onInsertNote,
  historyCount = 0,
  activeOrdinal = null,
  canGoPrevious = false,
  canGoNext = false,
  onPreviousVersion,
  onNextVersion,
}: AssistantNoteProps) {
  const { getLabel } = useHotkeyConfig();
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructions, setInstructions] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showInstructions && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInstructions]);

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

  const handleRightClick = () => {
    setShowInstructions((prev) => !prev);
  };

  const handleInstructionsKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Enter' && !isLoading) {
      const trimmedInstructions = instructions.trim();
      onRegenerate?.(trimmedInstructions || undefined);
      setInstructions('');
      setShowInstructions(false);
    }
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
          <Tooltip content={`Regenerate (${getLabel('aiRegenerate')})`}>
            <span>
              <SplitButton
                rightSlot={
                  isLoading ? (
                    <SpinnerIcon size={14} />
                  ) : (
                    <MessageSquare size={14} />
                  )
                }
                onClick={handleRegenerate}
                onRightClick={handleRightClick}
                disabled={isLoading}
              >
                {isLoading ? 'Generating...' : 'Regenerate'}
              </SplitButton>
            </span>
          </Tooltip>
        </NoteHeader>

        {showInstructions && (
          <InstructionsInput
            ref={inputRef}
            type="text"
            placeholder="Additional instructions for the AI..."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onKeyDown={handleInstructionsKeyDown}
            disabled={isLoading}
          />
        )}

        {isLoading && (
          <LoadingState>
            <SpinnerIcon size={16} />
            Generating note suggestion...
          </LoadingState>
        )}

        {error && !isLoading && (
          <ErrorState>Failed to generate note: {error.message}</ErrorState>
        )}

        {showEmptyState && (
          <EmptyState>
            No note has been generated yet. Click Regenerate to create an
            AI-powered note suggestion.
          </EmptyState>
        )}

        {hasSuggestion && !isLoading && (
          <NoteContent>
            <ReactMarkdown>{suggestion}</ReactMarkdown>
          </NoteContent>
        )}

        {((hasSuggestion && !isLoading) ||
          (historyCount > 0 && activeOrdinal != null)) && (
          <BottomToolbar>
            {hasSuggestion && !isLoading && (
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
                <Tooltip content={`Insert below your note (${getLabel('aiInsert')})`}>
                  <ActionButton
                    onClick={handleInsert}
                    aria-label="Insert note below yours"
                  >
                    <ArrowDownToLine size={12} />
                    Insert
                  </ActionButton>
                </Tooltip>
              </ActionButtons>
            )}
            {historyCount > 0 && activeOrdinal != null && (
              <VersionNav>
                <VersionChevronButton
                  type="button"
                  aria-label="Previous AI note version"
                  $atLimit={!canGoPrevious}
                  disabled={!canGoPrevious}
                  onClick={() => onPreviousVersion?.()}
                >
                  <ChevronLeft size={18} strokeWidth={2} />
                </VersionChevronButton>
                <VersionNavIndex>{activeOrdinal}</VersionNavIndex>
                <VersionChevronButton
                  type="button"
                  aria-label="Next AI note version"
                  $atLimit={!canGoNext}
                  disabled={!canGoNext}
                  onClick={() => onNextVersion?.()}
                >
                  <ChevronRight size={18} strokeWidth={2} />
                </VersionChevronButton>
              </VersionNav>
            )}
          </BottomToolbar>
        )}
      </ContentColumn>
    </NoteCard>
  );
}
