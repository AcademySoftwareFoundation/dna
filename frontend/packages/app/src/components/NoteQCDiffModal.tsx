import React from 'react';
import { Button, Dialog, Flex, Text } from '@radix-ui/themes';
import type { NoteQCResult } from '@dna/core';
import type { LocalDraftNote } from '../hooks/useDraftNote';
import { buildLocalPatch } from '../qc/noteQcPatch';

export interface NoteQCDiffModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: LocalDraftNote;
  qcResult: NoteQCResult | null;
  onApply: (patch: Partial<LocalDraftNote>) => Promise<void>;
}

export const NoteQCDiffModal: React.FC<NoteQCDiffModalProps> = ({
  open,
  onOpenChange,
  draft,
  qcResult,
  onApply,
}) => {
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setPending(false);
  }, [qcResult?.check_id]);

  const dialogOpen = Boolean(open && qcResult);

  const handleApply = async (qc: NoteQCResult) => {
    setPending(true);
    try {
      await onApply(buildLocalPatch(draft, qc));
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog.Root
      open={dialogOpen}
      onOpenChange={(next) => {
        if (!next) {
          onOpenChange(false);
        }
      }}
    >
      {qcResult ? (
        <Dialog.Content maxWidth="720px">
          <Dialog.Title>Apply QC suggestion</Dialog.Title>
          <Dialog.Description size="2" color="gray" mb="2">
            Review the suggested changes before updating your draft.
          </Dialog.Description>
          <Flex gap="2" align="start" style={{ width: '100%' }}>
            <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
              <Text size="1" weight="bold">
                Current
              </Text>
              <div
                style={{
                  maxHeight: 'min(220px, 42vh)',
                  overflowY: 'auto',
                  lineHeight: 1.45,
                }}
              >
                <Text as="span" size="2" style={{ whiteSpace: 'pre-wrap' }}>
                  {(draft.content ?? '') || '(empty)'}
                </Text>
              </div>
            </Flex>
            <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
              <Text size="1" weight="bold">
                Suggested
              </Text>
              <div
                style={{
                  maxHeight: 'min(220px, 42vh)',
                  overflowY: 'auto',
                  lineHeight: 1.45,
                }}
              >
                <Text as="span" size="2" style={{ whiteSpace: 'pre-wrap' }}>
                  {(qcResult.note_suggestion ?? draft.content ?? '') || '(empty)'}
                </Text>
              </div>
            </Flex>
          </Flex>
          {qcResult.attribute_suggestion ? (
            <Text size="1" color="gray" mt="2">
              Metadata changes may include subject, to, cc, links, and version status.
            </Text>
          ) : null}
          <Flex justify="end" gap="2" mt="3">
            <Dialog.Close>
              <Button variant="soft" color="gray" type="button" disabled={pending}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              onClick={() => void handleApply(qcResult)}
              disabled={pending}
            >
              {pending ? 'Applying…' : 'Apply to draft'}
            </Button>
          </Flex>
        </Dialog.Content>
      ) : null}
    </Dialog.Root>
  );
};
