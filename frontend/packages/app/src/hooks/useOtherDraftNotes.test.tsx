import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useOtherDraftNotes } from './useOtherDraftNotes';
import { apiHandler } from '../api';
import type { DraftNote } from '@dna/core';

vi.mock('../api', () => ({
  apiHandler: {
    getAllDraftNotes: vi.fn(),
    deleteDraftNote: vi.fn(),
  },
}));

const mockedApiHandler = vi.mocked(apiHandler);

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function createWrapper() {
  const queryClient = createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const mockDraftNotes: DraftNote[] = [
  {
    _id: 'abc123',
    user_email: 'current@example.com',
    playlist_id: 1,
    version_id: 2,
    content: 'Current user note',
    subject: '',
    to: '',
    cc: '',
    links: [],
    version_status: '',
    updated_at: '2025-01-15T00:00:00Z',
    created_at: '2025-01-15T00:00:00Z',
  },
  {
    _id: 'def456',
    user_email: 'other@example.com',
    playlist_id: 1,
    version_id: 2,
    content: 'Other user note',
    subject: 'Subject',
    to: '',
    cc: '',
    links: [],
    version_status: 'pending',
    updated_at: '2025-01-15T00:00:00Z',
    created_at: '2025-01-15T00:00:00Z',
  },
  {
    _id: 'ghi789',
    user_email: 'another@example.com',
    playlist_id: 1,
    version_id: 2,
    content: 'Another user note',
    subject: '',
    to: '',
    cc: '',
    links: [],
    version_status: '',
    updated_at: '2025-01-15T00:00:00Z',
    created_at: '2025-01-15T00:00:00Z',
  },
];

describe('useOtherDraftNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when params are not provided', () => {
    const { result } = renderHook(
      () =>
        useOtherDraftNotes({
          playlistId: null,
          versionId: null,
          currentUserEmail: null,
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current.otherNotes).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockedApiHandler.getAllDraftNotes).not.toHaveBeenCalled();
  });

  it('should fetch and filter out current user notes', async () => {
    mockedApiHandler.getAllDraftNotes.mockResolvedValue(mockDraftNotes);

    const { result } = renderHook(
      () =>
        useOtherDraftNotes({
          playlistId: 1,
          versionId: 2,
          currentUserEmail: 'current@example.com',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockedApiHandler.getAllDraftNotes).toHaveBeenCalledWith({
      playlistId: 1,
      versionId: 2,
    });

    expect(result.current.otherNotes).toHaveLength(2);
    expect(result.current.otherNotes[0].user_email).toBe('other@example.com');
    expect(result.current.otherNotes[1].user_email).toBe('another@example.com');
  });

  it('should return empty array when only current user has notes', async () => {
    mockedApiHandler.getAllDraftNotes.mockResolvedValue([mockDraftNotes[0]]);

    const { result } = renderHook(
      () =>
        useOtherDraftNotes({
          playlistId: 1,
          versionId: 2,
          currentUserEmail: 'current@example.com',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.otherNotes).toHaveLength(0);
  });

  it('should delete other user note', async () => {
    mockedApiHandler.getAllDraftNotes.mockResolvedValue(mockDraftNotes);
    mockedApiHandler.deleteDraftNote.mockResolvedValue(true);

    const { result } = renderHook(
      () =>
        useOtherDraftNotes({
          playlistId: 1,
          versionId: 2,
          currentUserEmail: 'current@example.com',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteOtherNote('other@example.com');
    });

    expect(mockedApiHandler.deleteDraftNote).toHaveBeenCalledWith({
      playlistId: 1,
      versionId: 2,
      userEmail: 'other@example.com',
    });
  });

  it('should indicate deleting state during mutation', async () => {
    mockedApiHandler.getAllDraftNotes.mockResolvedValue(mockDraftNotes);
    let resolveDelete: (value: boolean) => void;
    mockedApiHandler.deleteDraftNote.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        })
    );

    const { result } = renderHook(
      () =>
        useOtherDraftNotes({
          playlistId: 1,
          versionId: 2,
          currentUserEmail: 'current@example.com',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isDeleting).toBe(false);

    let deletePromise: Promise<void>;
    act(() => {
      deletePromise = result.current.deleteOtherNote('other@example.com');
    });

    await waitFor(() => {
      expect(result.current.isDeleting).toBe(true);
    });

    await act(async () => {
      resolveDelete!(true);
      await deletePromise!;
    });

    await waitFor(() => {
      expect(result.current.isDeleting).toBe(false);
    });
  });
});
