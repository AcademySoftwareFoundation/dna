import React, { useEffect } from 'react';
import styled from 'styled-components';
import {
  Dialog,
  Button,
  Flex,
  Text,
  Callout,
  TextField,
  ScrollArea,
} from '@radix-ui/themes';
import { Loader2, Info, Search } from 'lucide-react';
import { useGetRecentVersionsForProject } from '../api';
import { useEntitySearch } from '../hooks/useEntitySearch';
import { useAddVersionToPlaylist } from '../hooks/useAddVersionToPlaylist';

interface AddVersionDialogProps {
  open: boolean;
  onClose: () => void;
  playlistId: number;
  projectId: number;
}

const RECENT_LIMIT = 30;
const SEARCH_LIMIT = 20;

const SearchWrap = styled.div`
  margin-bottom: 12px;
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
  padding: 4px 0;
`;

const VersionRow = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  text-align: left;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.bg.surface};
  cursor: pointer;
  font-family: ${({ theme }) => theme.fonts.sans};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    border-color: ${({ theme }) => theme.colors.border.strong};
  }
`;

const VersionName = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const VersionDesc = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SpinnerIcon = styled(Loader2)`
  animation: spin 1s linear infinite;
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const EmptyState = styled.div`
  padding: 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.muted};
  font-size: 14px;
`;

export const AddVersionDialog: React.FC<AddVersionDialogProps> = ({
  open,
  onClose,
  playlistId,
  projectId,
}) => {
  const { data: recentVersions = [], isLoading: recentLoading } =
    useGetRecentVersionsForProject(projectId, RECENT_LIMIT);

  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    results: searchResults,
    isLoading: searchLoading,
  } = useEntitySearch({
    entityTypes: ['version'],
    projectId,
    limit: SEARCH_LIMIT,
  });

  const { mutate: addVersion, isPending: addPending, isError: addError, error: addErrorDetail, reset: resetAdd } =
    useAddVersionToPlaylist();

  useEffect(() => {
    if (open) {
      setSearchQuery('');
      resetAdd();
    }
  }, [open, setSearchQuery, resetAdd]);

  const showSearch = searchQuery.trim().length > 0;
  const versionResults = showSearch
    ? searchResults.filter((r) => r.type === 'Version')
    : [];
  const isLoading = showSearch ? searchLoading : recentLoading;
  const displayVersions: { id: number; name: string; description?: string }[] = showSearch
    ? versionResults.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
      }))
    : recentVersions.map((v) => ({
        id: v.id,
        name: v.name || `Version ${v.id}`,
        description: v.description,
      }));

  const handleSelect = (versionId: number) => {
    addVersion(
      { playlistId, versionId },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !addPending) onClose();
      }}
    >
      <Dialog.Content maxWidth="480px">
        <Dialog.Title>Add Version to Playlist</Dialog.Title>
        <Text size="2" color="gray" as="p" mb="3">
          Browse recent versions or search to add one to the current playlist.
        </Text>

        <SearchWrap>
          <TextField.Root
            placeholder="Search versions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="2"
          >
            <TextField.Slot>
              <Search size={16} />
            </TextField.Slot>
          </TextField.Root>
        </SearchWrap>

        {addError && (
          <Callout.Root color="red" mb="3">
            <Callout.Icon>
              <Info size={16} />
            </Callout.Icon>
            <Callout.Text>
              {addErrorDetail?.message ?? 'Failed to add version to playlist'}
            </Callout.Text>
          </Callout.Root>
        )}

        {isLoading ? (
          <Flex justify="center" py="6">
            <SpinnerIcon size={24} />
          </Flex>
        ) : displayVersions.length === 0 ? (
          <EmptyState>
            {showSearch
              ? 'No versions match your search.'
              : 'No recent versions in this project.'}
          </EmptyState>
        ) : (
          <ScrollArea type="auto" scrollbars="vertical">
            <List>
              {displayVersions.map((v) => (
                <VersionRow
                  key={v.id}
                  type="button"
                  onClick={() => handleSelect(v.id)}
                  disabled={addPending}
                >
                  <Flex direction="column" gap="1" style={{ minWidth: 0, flex: 1 }}>
                    <VersionName>{v.name}</VersionName>
                    {v.description && (
                      <VersionDesc>{v.description}</VersionDesc>
                    )}
                  </Flex>
                </VersionRow>
              ))}
            </List>
          </ScrollArea>
        )}

        <Flex justify="end" gap="2" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray" disabled={addPending}>
              Cancel
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};
