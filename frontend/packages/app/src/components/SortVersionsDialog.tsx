import styled from 'styled-components';
import { Button, Dialog, Flex, Switch } from '@radix-ui/themes';
import { RadioOption, RadioOptionGroup } from './RadioOption';
import type { VersionSortField } from './versionSort';
import { useVersionSort } from '../contexts';

const SORT_OPTIONS: {
  field: VersionSortField;
  label: string;
  /** Describes the direction: [normal, reversed]. */
  directions: [string, string];
}[] = [
  {
    field: 'playlist',
    label: 'Playlist Order',
    directions: ['As ordered on the playlist', 'Last on the playlist first'],
  },
  { field: 'name', label: 'Version Name', directions: ['A to Z', 'Z to A'] },
  {
    field: 'pipeline_step',
    label: 'Pipeline Step',
    directions: ['A to Z', 'Z to A'],
  },
  {
    field: 'created_at',
    label: 'Created Date',
    directions: ['Oldest first', 'Newest first'],
  },
  {
    field: 'updated_at',
    label: 'Updated Date',
    directions: ['Oldest first', 'Newest first'],
  },
];

const ReverseControl = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
  cursor: pointer;
`;

interface SortVersionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SortVersionsDialog({
  open,
  onOpenChange,
}: SortVersionsDialogProps) {
  const { sort, setSort } = useVersionSort();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="440px">
        <Flex justify="between" align="start" gap="4">
          <Dialog.Title>Sort Versions</Dialog.Title>
          <ReverseControl>
            Reverse Order
            <Switch
              size="1"
              checked={sort.reversed}
              onCheckedChange={(reversed) => setSort({ ...sort, reversed })}
            />
          </ReverseControl>
        </Flex>
        <Dialog.Description size="2" color="gray" mb="4">
          Sets the order of the version list.
        </Dialog.Description>
        <RadioOptionGroup
          value={sort.field}
          onValueChange={(field) =>
            setSort({ ...sort, field: field as VersionSortField })
          }
        >
          {SORT_OPTIONS.map(({ field, label, directions }) => (
            <RadioOption
              key={field}
              value={field}
              id={`version-sort-${field}`}
              label={label}
              description={directions[sort.reversed ? 1 : 0]}
            />
          ))}
        </RadioOptionGroup>
        <Flex justify="end" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Close
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
