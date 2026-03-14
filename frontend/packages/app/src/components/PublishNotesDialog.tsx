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
    const [publishedImageCount, setPublishedImageCount] = useState(0);
    const [publishedStatusCount, setPublishedStatusCount] = useState(0);
    const { mutate: publishNotes, isPending, isError, error, data, reset } = usePublishNotes();

    React.useEffect(() => {
        if (open) {
            reset();
            setIncludeOthers(false);
            setPublishedImageCount(0);
            setPublishedStatusCount(0);
        }
    }, [open, reset]);

    // Notes that need publishing: never published OR published but edited (republish)
    const unpublishedNotes = draftNotes.filter((n) => !n.published || n.edited);
    const myUnpublished = unpublishedNotes.filter(n => n.user_email === userEmail);
    const othersUnpublished = unpublishedNotes.filter(n => n.user_email !== userEmail);
    // Only truly done notes: published AND not edited
    const doneNotes = draftNotes.filter(n => n.published && !n.edited);

    const notesToPublishCount = includeOthers
        ? unpublishedNotes.length
        : myUnpublished.length;

    const countImages = (notes: DraftNote[]) =>
        notes.reduce((sum, n) => sum + (n.attachment_ids?.length ?? 0), 0);

    const myUnpublishedImages = countImages(myUnpublished);
    const othersUnpublishedImages = countImages(othersUnpublished);
    const alreadyPublishedImages = countImages(doneNotes);
    const totalImagesToPublish = includeOthers
        ? myUnpublishedImages + othersUnpublishedImages
        : myUnpublishedImages;

    const countStatuses = (notes: DraftNote[]) =>
        notes.filter(n => !!n.version_status).length;

    const myUnpublishedStatuses = countStatuses(myUnpublished);
    const othersUnpublishedStatuses = countStatuses(othersUnpublished);
    const totalStatusesToPublish = includeOthers
        ? myUnpublishedStatuses + othersUnpublishedStatuses
        : myUnpublishedStatuses;

    const handlePublish = () => {
        setPublishedImageCount(totalImagesToPublish);
        setPublishedStatusCount(totalStatusesToPublish);
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
                                {data.published_count > 0 && <li>Notes Published: {data.published_count}</li>}
                                {data.republished_count > 0 && <li>Notes Republished: {data.republished_count}</li>}
                                {publishedImageCount > 0 && <li>Images Attached: {publishedImageCount}</li>}
                                {publishedStatusCount > 0 && <li>Statuses Updated: {publishedStatusCount}</li>}
                                {data.failed_count > 0 && <li>Notes Failed: {data.failed_count}</li>}
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
                            You are about to publish <strong>{notesToPublishCount}</strong> draft {notesToPublishCount !== 1 ? 'notes' : 'note'}
                            {totalImagesToPublish > 0 && <> with <strong>{totalImagesToPublish}</strong> image{totalImagesToPublish !== 1 ? 's' : ''}</>} to ShotGrid.
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
                            {myUnpublishedImages > 0 && (
                                <StatRow>
                                    <span>My Unpublished Images</span>
                                    <strong>{myUnpublishedImages}</strong>
                                </StatRow>
                            )}
                            {othersUnpublished.length > 0 && othersUnpublishedImages > 0 && (
                                <StatRow>
                                    <span>Other Users' Images</span>
                                    <strong>{othersUnpublishedImages}</strong>
                                </StatRow>
                            )}
                            {alreadyPublishedImages > 0 && (
                                <StatRow>
                                    <span>Images Not Being Re-published</span>
                                    <strong>{alreadyPublishedImages}</strong>
                                </StatRow>
                            )}
                            {myUnpublishedStatuses > 0 && (
                                <StatRow>
                                    <span>My Unpublished Statuses</span>
                                    <strong>{myUnpublishedStatuses}</strong>
                                </StatRow>
                            )}
                            {othersUnpublished.length > 0 && othersUnpublishedStatuses > 0 && (
                                <StatRow>
                                    <span>Other Users' Status Changes</span>
                                    <strong>{othersUnpublishedStatuses}</strong>
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
