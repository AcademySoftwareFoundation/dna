import React, { useState } from 'react';
import styled from 'styled-components';
import { Dialog, Button, Checkbox, Flex, Text, Callout } from '@radix-ui/themes';
import { Loader2, Info } from 'lucide-react';
import { usePublishNotes } from '../hooks/usePublishNotes';
import { DraftNote } from '@dna/core';

interface PublishNotesDialogProps {
    open: boolean;
    onClose: () => void;
    playlistId: number;
    userEmail: string;
    draftNotes: DraftNote[];
}

const SummaryBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: ${({ theme }) => theme.colors.bg.surfaceHover};
  border-radius: ${({ theme }) => theme.radii.md};
  margin-top: 12px;
`;

const StatRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  margin-top: 16px;
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

const ResultList = styled.ul`
  margin: 0;
  padding-left: 20px;
  font-size: 14px;
`;

export const PublishNotesDialog: React.FC<PublishNotesDialogProps> = ({
    open,
    onClose,
    playlistId,
    userEmail,
    draftNotes,
}) => {
    const [includeOthers, setIncludeOthers] = useState(false);
    const { mutate: publishNotes, isPending, isError, error, data } = usePublishNotes();

    const unpublishedNotes = draftNotes.filter((n: any) => !n.published);
    const myUnpublished = unpublishedNotes.filter(n => n.user_email === userEmail);
    const othersUnpublished = unpublishedNotes.filter(n => n.user_email !== userEmail);

    const notesToPublishCount = includeOthers
        ? unpublishedNotes.length
        : myUnpublished.length;

    const handlePublish = () => {
        publishNotes(
            {
                playlistId,
                request: {
                    user_email: userEmail,
                    include_others: includeOthers,
                },
            },
            {
                onSuccess: () => {
                    // Keep dialog open to show results
                },
            }
        );
    };

    const handleClose = () => {
        onClose();
    };

    return (
        <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && !isPending && handleClose()}>
            <Dialog.Content maxWidth="450px">
                <Dialog.Title>Publish Notes to ShotGrid</Dialog.Title>

                {data ? (
                    <Flex direction="column" gap="4">
                        <Callout.Root color="green">
                            <Callout.Icon>
                                <Info size={16} />
                            </Callout.Icon>
                            <Callout.Text>Publishing Complete!</Callout.Text>
                        </Callout.Root>

                        <SummaryBox>
                            <Text weight="bold" size="2">Results:</Text>
                            <ResultList>
                                <li>Published: {data.published_count}</li>
                                <li>Skipped: {data.skipped_count}</li>
                                <li>Failed: {data.failed_count}</li>
                            </ResultList>
                        </SummaryBox>

                        <Flex justify="end" mt="4">
                            <Dialog.Close>
                                <Button onClick={handleClose}>Close</Button>
                            </Dialog.Close>
                        </Flex>
                    </Flex>
                ) : (
                    <Flex direction="column" gap="4">
                        <Text size="3">
                            You are about to publish <strong>{notesToPublishCount}</strong> draft notes to ShotGrid.
                        </Text>

                        <SummaryBox>
                            <StatRow>
                                <span>My Unpublished Notes</span>
                                <strong>{myUnpublished.length}</strong>
                            </StatRow>
                            {othersUnpublished.length > 0 && (
                                <StatRow>
                                    <span>Other Users' Notes</span>
                                    <strong>{othersUnpublished.length}</strong>
                                </StatRow>
                            )}
                        </SummaryBox>

                        {othersUnpublished.length > 0 && (
                            <CheckboxRow>
                                <Checkbox
                                    checked={includeOthers}
                                    onCheckedChange={(checked) => setIncludeOthers(!!checked)}
                                />
                                <Text size="2">Include notes from other users</Text>
                            </CheckboxRow>
                        )}

                        {isError && (
                            <Callout.Root color="red">
                                <Callout.Icon>
                                    <Info size={16} />
                                </Callout.Icon>
                                <Callout.Text>
                                    {error?.message || 'Failed to publish notes'}
                                </Callout.Text>
                            </Callout.Root>
                        )}

                        <Flex justify="end" gap="3" mt="4">
                            <Dialog.Close>
                                <Button variant="soft" color="gray" disabled={isPending}>
                                    Cancel
                                </Button>
                            </Dialog.Close>
                            <Button
                                disabled={isPending || notesToPublishCount === 0}
                                onClick={handlePublish}
                            >
                                {isPending && <SpinnerIcon size={14} />}
                                {isPending ? 'Publishing...' : 'Publish'}
                            </Button>
                        </Flex>
                    </Flex>
                )}
            </Dialog.Content>
        </Dialog.Root>
    );
};
