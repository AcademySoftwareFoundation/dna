import styled from 'styled-components';
import * as Tabs from '@radix-ui/react-tabs';
import { AssistantNote } from './AssistantNote';

interface AssistantPanelProps {
  activeTab?: string;
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

const EmptyContent = styled.div`
  padding: 24px;
  text-align: center;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

export function AssistantPanel({
  activeTab = 'assistant',
}: AssistantPanelProps) {
  return (
    <PanelWrapper>
      <StyledTabsRoot defaultValue={activeTab}>
        <StyledTabsList>
          <StyledTabsTrigger value="assistant">AI Assistent</StyledTabsTrigger>
          <StyledTabsTrigger value="transcript">Transcript</StyledTabsTrigger>
          <StyledTabsTrigger value="other">Other Notes</StyledTabsTrigger>
        </StyledTabsList>

        <StyledTabsContent value="assistant">
          <AssistantNote />
        </StyledTabsContent>

        <StyledTabsContent value="transcript">
          <EmptyContent>Transcript content will appear here</EmptyContent>
        </StyledTabsContent>

        <StyledTabsContent value="other">
          <EmptyContent>Other notes will appear here</EmptyContent>
        </StyledTabsContent>
      </StyledTabsRoot>
    </PanelWrapper>
  );
}
