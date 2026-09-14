import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MentionIndexProvider, useMentionIndex } from './MentionIndexContext';
import { apiHandler } from '../api';

vi.mock('../api', () => ({
  apiHandler: {
    searchEntities: vi.fn(),
  },
}));

const mockedSearch = vi.mocked(apiHandler.searchEntities);

function createWrapper(projectId: number | null) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MentionIndexProvider projectId={projectId}>
          {children}
        </MentionIndexProvider>
      </QueryClientProvider>
    );
  };
}

describe('MentionIndexProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefetches one search per entity type when projectId is set', async () => {
    mockedSearch.mockResolvedValue([]);
    const { result } = renderHook(() => useMentionIndex(), {
      wrapper: createWrapper(42),
    });

    await waitFor(() => expect(mockedSearch).toHaveBeenCalledTimes(5));
    await waitFor(() => expect(result.current?.isIndexLoading).toBe(false));
    expect(mockedSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        query: '',
        projectId: 42,
      })
    );
  });

  it('does not call search when projectId is null', () => {
    const { result } = renderHook(() => useMentionIndex(), {
      wrapper: createWrapper(null),
    });
    expect(mockedSearch).not.toHaveBeenCalled();
    expect(result.current?.mergedCandidates).toEqual([]);
    expect(result.current?.isIndexLoading).toBe(false);
  });
});
