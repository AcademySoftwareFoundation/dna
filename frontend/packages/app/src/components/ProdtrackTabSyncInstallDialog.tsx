import {
  AlertDialog,
  Button,
  Flex,
  Link,
  Text,
} from '@radix-ui/themes';

const DEFAULT_INSTALL_DOC_URL =
  'https://github.com/AcademySoftwareFoundation/dna/blob/main/prodtrack-tab-sync-extension/README.md';

interface ProdtrackTabSyncInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installDocUrl?: string;
}

export function ProdtrackTabSyncInstallDialog({
  open,
  onOpenChange,
  installDocUrl = DEFAULT_INSTALL_DOC_URL,
}: ProdtrackTabSyncInstallDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Content maxWidth="440px">
        <AlertDialog.Title>Install the DNA tab sync extension</AlertDialog.Title>
        <AlertDialog.Description size="2" asChild>
          <Flex direction="column" gap="3">
            <Text as="p" size="2" color="gray">
              DNA could not reach the Chrome extension that keeps your
              production-tracking tab in sync. Install the extension, add your
              DNA site to <Text weight="medium">externally_connectable</Text> in
              its manifest if needed, set{' '}
              <Text weight="medium">VITE_PRODTRACK_TAB_SYNC_EXTENSION_ID</Text>{' '}
              in your DNA environment, then try again.
            </Text>
            <Text size="2">
              <Link href={installDocUrl} target="_blank" rel="noreferrer">
                Installation instructions
              </Link>
            </Text>
          </Flex>
        </AlertDialog.Description>
        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray">
              Close
            </Button>
          </AlertDialog.Cancel>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
