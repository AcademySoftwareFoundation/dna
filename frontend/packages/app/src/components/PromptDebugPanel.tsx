import styled from 'styled-components';

interface PromptDebugPanelProps {
  prompt: string | null;
  context: string | null;
}

const PanelWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SectionTitle = styled.h4`
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const CodeBlock = styled.pre`
  margin: 0;
  padding: 12px;
  font-size: 12px;
  font-family: ${({ theme }) => theme.fonts.mono};
  background: ${({ theme }) => theme.colors.background.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const EmptyState = styled.div`
  padding: 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.muted};
  font-size: 14px;
`;

export function PromptDebugPanel({ prompt, context }: PromptDebugPanelProps) {
  if (!prompt && !context) {
    return (
      <EmptyState>
        No prompt data available. Generate a note to see the prompt.
      </EmptyState>
    );
  }

  return (
    <PanelWrapper>
      <Section>
        <SectionTitle>Version Context</SectionTitle>
        <CodeBlock>{context || 'No context available'}</CodeBlock>
      </Section>

      <Section>
        <SectionTitle>Full Prompt (with substitutions)</SectionTitle>
        <CodeBlock>{prompt || 'No prompt available'}</CodeBlock>
      </Section>
    </PanelWrapper>
  );
}
