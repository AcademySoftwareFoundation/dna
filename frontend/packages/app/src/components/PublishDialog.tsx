import { useState } from 'react';
import { Dialog, Flex } from '@radix-ui/themes';
import type { DraftNote, Version } from '@dna/core';
import { PublishNotesTabContent } from './PublishNotesDialog';
import { useNomenclature } from '../nomenclature';

export interface PublishDialogProps {
  open: boolean;
  onClose: () => void;
  playlistId: string;
  userEmail: string;
  notes: DraftNote[];
  versions?: Version[];
}

export function PublishDialog({
  open,
  onClose,
  playlistId,
  userEmail,
  notes,
  versions = [],
}: PublishDialogProps) {
  const t = useNomenclature();
  const [isPending, setIsPending] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && !isPending && onClose()}>
      <Dialog.Content
        maxWidth="900px"
        style={{
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
        }}
      >
        <Dialog.Description style={{ display: 'none' }}>
          Review and {t.publish.lower} {t.note.lowerPlural} and transcripts to{' '}
          {t.productionTracking.lower}.
        </Dialog.Description>
        <Flex
          align="center"
          justify="between"
          gap="3"
          p="4"
          style={{ borderBottom: '1px solid var(--gray-a6)', flexShrink: 0 }}
        >
          <Dialog.Title style={{ margin: 0 }}>{t.publish.verb}</Dialog.Title>
        </Flex>
        <PublishNotesTabContent
          open={open}
          onClose={onClose}
          playlistId={playlistId}
          userEmail={userEmail}
          notes={notes}
          versions={versions}
          onPendingChange={setIsPending}
          showTitle={false}
        />
      </Dialog.Content>
    </Dialog.Root>
  );
}
