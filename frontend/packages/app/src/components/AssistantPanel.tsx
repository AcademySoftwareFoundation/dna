import styled from 'styled-components';
import * as Tabs from '@radix-ui/react-tabs';
import { AssistantNote } from './AssistantNote';
import { OtherNotesPanel } from './OtherNotesPanel';
import { TranscriptPanel } from './TranscriptPanel';

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
  return (
    <PanelWrapper>
      <StyledTabsRoot defaultValue={activeTab}>
        <StyledTabsList>
          <StyledTabsTrigger value="assistant">AI Assistant</StyledTabsTrigger>
          <StyledTabsTrigger value="transcript">Transcript</StyledTabsTrigger>
          <StyledTabsTrigger value="other">
            Other Pending Notes
          </StyledTabsTrigger>
        </StyledTabsList>

        <StyledTabsContent value="assistant">
          <AssistantNote onInsertNote={onInsertNote} />
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
      </StyledTabsRoot>
    </PanelWrapper>
  );
}
