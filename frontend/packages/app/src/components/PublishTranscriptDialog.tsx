import React from 'react';
import styled from 'styled-components';
import { Dialog, Button, Flex, Text, Callout } from '@radix-ui/themes';
import { Info, Loader2 } from 'lucide-react';
import { usePublishTranscript } from '../hooks/usePublishTranscript';

interface PublishTranscriptDialogProps {
  open: boolean;
  onClose: () => void;
  playlistId: number;
  versionId: number;
  segmentsCount: number;
}

const SummaryBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
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

function outcomeMessage(
  outcome: string,
  skippedReason?: string | null
): string {
  if (outcome === 'created') return 'Published to Flow Production Tracking.';
  if (outcome === 'updated') return 'Existing row updated with new content.';
  if (outcome === 'skipped') {
    if (skippedReason === 'no_changes_since_last_publish') {
      return 'No changes since the last publish.';
    }
    return 'Skipped.';
  }
  return outcome;
}

export const PublishTranscriptDialog: React.FC<
  PublishTranscriptDialogProps
> = ({ open, onClose, playlistId, versionId, segmentsCount }) => {
  const { mutate, isPending, isError, error, data, reset } =
    usePublishTranscript();

  React.useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const handlePublish = () => {
    mutate({ playlistId, request: { version_id: versionId } });
  };

  const canPublish = !isPending && segmentsCount > 0;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => !isOpen && !isPending && onClose()}
    >
      <Dialog.Content maxWidth="440px">
        <Dialog.Title>Publish transcript</Dialog.Title>
        <Dialog.Description size="2">
          Push the captured transcript for this version to the production
          tracking system as a custom-entity row.
        </Dialog.Description>

        <Flex direction="column" gap="3">
          <SummaryBox>
            <StatRow>
              <span>Version</span>
              <strong>{versionId}</strong>
            </StatRow>
            <StatRow>
              <span>Segments</span>
              <strong>{segmentsCount}</strong>
            </StatRow>
          </SummaryBox>

          {data && (
            <Callout.Root
              color={data.outcome === 'skipped' ? 'amber' : 'green'}
            >
              <Callout.Icon>
                <Info size={16} />
              </Callout.Icon>
              <Callout.Text>
                {data.outcome === 'created' && 'Published. '}
                {data.outcome === 'updated' && 'Updated. '}
                {outcomeMessage(data.outcome, data.skipped_reason)}
              </Callout.Text>
            </Callout.Root>
          )}

          {isError && (
            <Callout.Root color="red">
              <Callout.Icon>
                <Info size={16} />
              </Callout.Icon>
              <Callout.Text>
                {error?.message || 'Failed to publish transcript'}
              </Callout.Text>
            </Callout.Root>
          )}

          <Flex justify="end" gap="3" mt="2">
            <Dialog.Close>
              <Button variant="soft" color="gray" disabled={isPending}>
                Close
              </Button>
            </Dialog.Close>
            <Button onClick={handlePublish} disabled={!canPublish}>
              {isPending && <SpinnerIcon size={14} />}
              {isPending ? 'Publishing...' : 'Publish'}
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};
