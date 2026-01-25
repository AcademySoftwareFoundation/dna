import { useState, useEffect, useCallback, type ReactNode } from 'react';
import styled from 'styled-components';
import { Dialog, Button, Checkbox, Text, TextArea, Flex, Tooltip } from '@radix-ui/themes';
import { Loader2, Info } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UserSettings, UserSettingsUpdate } from '@dna/core';
import { apiHandler } from '../api';

interface SettingsModalProps {
  userEmail: string;
  trigger: ReactNode;
}

const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const SectionTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const SectionDescription = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.muted};
  margin: 0 0 8px 0;
`;

const TextAreaWrapper = styled.div`
  position: relative;
`;

const StyledTextArea = styled(TextArea)`
  min-height: 120px;
  resize: vertical;
  font-family: ${({ theme }) => theme.fonts.sans};
`;

const CheckboxRow = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  cursor: pointer;
`;

const CheckboxContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const CheckboxLabel = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const CheckboxDescription = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const TooltipIcon = styled.span`
  display: inline-flex;
  align-items: center;
  color: ${({ theme }) => theme.colors.text.muted};
  cursor: help;
  margin-left: 4px;
`;

const SpinnerIcon = styled(Loader2)`
  animation: spin 1s linear infinite;
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.subtle};
`;

export function SettingsModal({ userEmail, trigger }: SettingsModalProps) {
  const [open, setOpen] = useState(false);
  const [notePrompt, setNotePrompt] = useState('');
  const [regenerateOnVersionChange, setRegenerateOnVersionChange] =
    useState(false);
  const [regenerateOnTranscriptUpdate, setRegenerateOnTranscriptUpdate] =
    useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<UserSettings | null>({
    queryKey: ['userSettings', userEmail],
    queryFn: () => apiHandler.getUserSettings({ userEmail }),
    enabled: open && !!userEmail,
  });

  const mutation = useMutation({
    mutationFn: (data: UserSettingsUpdate) =>
      apiHandler.upsertUserSettings({ userEmail, data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSettings', userEmail] });
      setIsDirty(false);
    },
  });

  useEffect(() => {
    if (settings) {
      setNotePrompt(settings.note_prompt);
      setRegenerateOnVersionChange(settings.regenerate_on_version_change);
      setRegenerateOnTranscriptUpdate(settings.regenerate_on_transcript_update);
      setIsDirty(false);
    } else if (settings === null) {
      setNotePrompt('');
      setRegenerateOnVersionChange(false);
      setRegenerateOnTranscriptUpdate(false);
      setIsDirty(false);
    }
  }, [settings]);

  const handleNotePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setNotePrompt(e.target.value);
      setIsDirty(true);
    },
    []
  );

  const handleRegenerateOnVersionChange = useCallback((checked: boolean) => {
    setRegenerateOnVersionChange(checked);
    setIsDirty(true);
  }, []);

  const handleRegenerateOnTranscriptUpdate = useCallback((checked: boolean) => {
    setRegenerateOnTranscriptUpdate(checked);
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    mutation.mutate({
      note_prompt: notePrompt,
      regenerate_on_version_change: regenerateOnVersionChange,
      regenerate_on_transcript_update: regenerateOnTranscriptUpdate,
    });
  }, [
    mutation,
    notePrompt,
    regenerateOnVersionChange,
    regenerateOnTranscriptUpdate,
  ]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen && isDirty) {
        handleSave();
      }
      setOpen(isOpen);
    },
    [isDirty, handleSave]
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger>{trigger}</Dialog.Trigger>
      <Dialog.Content maxWidth="540px">
        <Dialog.Title>Settings</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          Configure your preferences for note generation and AI assistance.
        </Dialog.Description>

        {isLoading ? (
          <Flex align="center" justify="center" py="6">
            <SpinnerIcon size={24} />
          </Flex>
        ) : (
          <ModalContent>
            <Section>
              <SectionTitle>
                Note Taking Prompt
                <Tooltip
                  content={
                    <>
                      Customize the prompt used when generating notes from
                      transcript and version information. You can include the
                      following tags in the prompt:
                      <br />
                      <br />
                      {'{{ transcript }}'} - What was said on this version
                      <br />
                      {'{{ context }}'} - Includes context for the version
                      <br />
                      {'{{ notes }}'} - Any notes you took on this version
                      already
                    </>
                  }
                >
                  <TooltipIcon>
                    <Info size={14} />
                  </TooltipIcon>
                </Tooltip>
              </SectionTitle>
              <SectionDescription>
                This prompt is used when generating notes via the transcript and
                version information.
              </SectionDescription>
              <TextAreaWrapper>
                <StyledTextArea
                  placeholder="Enter your custom prompt for generating notes..."
                  value={notePrompt}
                  onChange={handleNotePromptChange}
                  disabled={mutation.isPending}
                />
              </TextAreaWrapper>
            </Section>

            <Section>
              <SectionTitle>Note Regeneration</SectionTitle>
              <CheckboxRow>
                <Checkbox
                  checked={regenerateOnVersionChange}
                  onCheckedChange={handleRegenerateOnVersionChange}
                  disabled={mutation.isPending}
                />
                <CheckboxContent>
                  <CheckboxLabel>
                    Regenerate notes on version change
                  </CheckboxLabel>
                  <CheckboxDescription>
                    Automatically regenerate the AI note when switching to a
                    different version in review.
                  </CheckboxDescription>
                </CheckboxContent>
              </CheckboxRow>

              <CheckboxRow>
                <Checkbox
                  checked={regenerateOnTranscriptUpdate}
                  onCheckedChange={handleRegenerateOnTranscriptUpdate}
                  disabled={mutation.isPending}
                />
                <CheckboxContent>
                  <CheckboxLabel>Regenerate on transcript update</CheckboxLabel>
                  <CheckboxDescription>
                    Automatically regenerate the AI note when a new transcript
                    segment comes in or an existing segment is updated.
                  </CheckboxDescription>
                </CheckboxContent>
              </CheckboxRow>
            </Section>

            <Footer>
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  Close
                </Button>
              </Dialog.Close>
            </Footer>
          </ModalContent>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
