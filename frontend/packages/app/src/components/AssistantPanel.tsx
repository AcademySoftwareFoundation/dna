import styled from 'styled-components';
import * as Tabs from '@radix-ui/react-tabs';
import { AssistantNote } from './AssistantNote';
import { OtherNotesPanel } from './OtherNotesPanel';
import { TranscriptPanel } from './TranscriptPanel';
import { PromptDebugPanel } from './PromptDebugPanel';
import { useAISuggestion } from '../hooks';

const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';

interface AssistantPanelProps {
  activeTab?: string;
  playlistId?: number | null;
  versionId?: number | null;
  userEmail?: string | null;
  onInsertNote?: (content: string) => void;
}

const PanelWrapper = styled.div`
  display: flex;
  flex-direction: column;
`;

const StyledTabsRoot = styled(Tabs.Root)`
  display: flex;
  flex-direction: column;
`;

const StyledTabsList = styled(Tabs.List)`
  display: flex;
  align-items: center;
  gap: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
`;

const StyledTabsTrigger = styled(Tabs.Trigger)`
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.muted};
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    color: ${({ theme }) => theme.colors.text.secondary};
  }

  &[data-state='active'] {
    color: ${({ theme }) => theme.colors.text.primary};
    border-bottom-color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const StyledTabsContent = styled(Tabs.Content)`
  padding: 16px 0;
`;

export function AssistantPanel({
  activeTab = 'assistant',
  playlistId,
  versionId,
  userEmail,
  onInsertNote,
}: AssistantPanelProps) {
  const { suggestion, prompt, context, isLoading, error, regenerate } = useAISuggestion({
    playlistId: playlistId ?? null,
    versionId: versionId ?? null,
    userEmail: userEmail ?? null,
  });

  return (
    <PanelWrapper>
      <StyledTabsRoot defaultValue={activeTab}>
        <StyledTabsList>
          <StyledTabsTrigger value="assistant">AI Assistant</StyledTabsTrigger>
          <StyledTabsTrigger value="transcript">Transcript</StyledTabsTrigger>
          <StyledTabsTrigger value="other">
            Other Pending Notes
          </StyledTabsTrigger>
          {isDevMode && (
            <StyledTabsTrigger value="debug">Prompt Debug</StyledTabsTrigger>
          )}
        </StyledTabsList>

        <StyledTabsContent value="assistant">
          <AssistantNote
            suggestion={suggestion}
            isLoading={isLoading}
            error={error}
            onRegenerate={regenerate}
            onInsertNote={onInsertNote}
          />
        </StyledTabsContent>

        <StyledTabsContent value="transcript">
          <TranscriptPanel
            playlistId={playlistId ?? null}
            versionId={versionId ?? null}
          />
        </StyledTabsContent>

        <StyledTabsContent value="other">
          <OtherNotesPanel
            playlistId={playlistId}
            versionId={versionId}
            userEmail={userEmail}
            onInsertNote={onInsertNote}
          />
        </StyledTabsContent>

        {isDevMode && (
          <StyledTabsContent value="debug">
            <PromptDebugPanel prompt={prompt} context={context} />
          </StyledTabsContent>
        )}
      </StyledTabsRoot>
    </PanelWrapper>
  );
}
