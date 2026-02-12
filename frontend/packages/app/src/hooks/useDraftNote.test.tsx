import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useDraftNote } from './useDraftNote';
import { apiHandler } from '../api';
import type { DraftNote } from '@dna/core';

vi.mock('../api', () => ({
  apiHandler: {
    getDraftNote: vi.fn(),
    upsertDraftNote: vi.fn(),
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

const mockDraftNote: DraftNote = {
  _id: 'abc123',
  user_email: 'test@example.com',
  playlist_id: 1,
  version_id: 2,
  content: 'Test content',
  subject: 'Test subject',
  to: 'recipient@example.com',
  cc: '',
  links: [],
  version_status: 'pending',
  updated_at: '2025-01-15T00:00:00Z',
  created_at: '2025-01-15T00:00:00Z',
};

describe('useDraftNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null draft note when params are not provided', () => {
    const { result } = renderHook(
      () =>
        useDraftNote({
          playlistId: null,
          versionId: null,
          userEmail: null,
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current.draftNote).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(mockedApiHandler.getDraftNote).not.toHaveBeenCalled();
  });

  it('should fetch draft note when all params are provided', async () => {
    mockedApiHandler.getDraftNote.mockResolvedValue(mockDraftNote);

    const { result } = renderHook(
      () =>
        useDraftNote({
          playlistId: 1,
          versionId: 2,
          userEmail: 'test@example.com',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockedApiHandler.getDraftNote).toHaveBeenCalledWith({
      playlistId: 1,
      versionId: 2,
      userEmail: 'test@example.com',
    });

    expect(result.current.draftNote).toEqual({
      content: 'Test content',
      subject: 'Test subject',
      to: 'recipient@example.com',
      cc: '',
      linksText: '',
      versionStatus: 'pending',
    });
  });

  it('should create empty draft when no server draft exists', async () => {
    mockedApiHandler.getDraftNote.mockResolvedValue(null);

    const { result } = renderHook(
      () =>
        useDraftNote({
          playlistId: 1,
          versionId: 2,
          userEmail: 'test@example.com',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.draftNote).not.toBeNull();
    });

    expect(result.current.draftNote).toEqual({
      content: '',
      subject: '',
      to: '',
      cc: '',
      linksText: '',
      versionStatus: '',
    });
  });

  it('should update draft note locally immediately', async () => {
    mockedApiHandler.getDraftNote.mockResolvedValue(null);
    mockedApiHandler.upsertDraftNote.mockResolvedValue(mockDraftNote);

    const { result } = renderHook(
      () =>
        useDraftNote({
          playlistId: 1,
          versionId: 2,
          userEmail: 'test@example.com',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.draftNote).not.toBeNull();
    });

    act(() => {
      result.current.updateDraftNote({ content: 'New content' });
    });

    expect(result.current.draftNote?.content).toBe('New content');
  });

  it('should call upsert API after debounce', async () => {
    mockedApiHandler.getDraftNote.mockResolvedValue(null);
    mockedApiHandler.upsertDraftNote.mockResolvedValue(mockDraftNote);

    const { result } = renderHook(
      () =>
        useDraftNote({
          playlistId: 1,
          versionId: 2,
          userEmail: 'test@example.com',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.draftNote).not.toBeNull();
    });

    act(() => {
      result.current.updateDraftNote({ content: 'New content' });
    });

    await waitFor(
      () => {
        expect(mockedApiHandler.upsertDraftNote).toHaveBeenCalled();
      },
      { timeout: 1000 }
    );

    expect(mockedApiHandler.upsertDraftNote).toHaveBeenCalledWith({
      playlistId: 1,
      versionId: 2,
      userEmail: 'test@example.com',
      data: {
        content: 'New content',
        subject: '',
        to: '',
        cc: '',
        links: [],
        version_status: '',
      },
    });
  });

  it('should clear draft note and call delete API', async () => {
    mockedApiHandler.getDraftNote.mockResolvedValue(mockDraftNote);
    mockedApiHandler.deleteDraftNote.mockResolvedValue(true);

    const { result } = renderHook(
      () =>
        useDraftNote({
          playlistId: 1,
          versionId: 2,
          userEmail: 'test@example.com',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.draftNote?.content).toBe('Test content');
    });

    act(() => {
      result.current.clearDraftNote();
    });

    expect(result.current.draftNote).toEqual({
      content: '',
      subject: '',
      to: '',
      cc: '',
      linksText: '',
      versionStatus: '',
    });

    await waitFor(() => {
      expect(mockedApiHandler.deleteDraftNote).toHaveBeenCalledWith({
        playlistId: 1,
        versionId: 2,
        userEmail: 'test@example.com',
      });
    });
  });

  it('should not call API when updating with null params', async () => {
    const { result } = renderHook(
      () =>
        useDraftNote({
          playlistId: null,
          versionId: null,
          userEmail: null,
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.updateDraftNote({ content: 'Test' });
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(mockedApiHandler.upsertDraftNote).not.toHaveBeenCalled();
  });
});
