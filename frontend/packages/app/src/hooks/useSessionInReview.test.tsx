import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NomenclatureProvider } from '../nomenclature';
import type { ReactNode } from 'react';
import type {
  DNAEvent,
  Session,
  SessionInReviewChangedEventPayload,
} from '@dna/core';
import {
  useSessionInReviewEvents,
  useSessionSetInReview,
} from './useSessionInReview';

type Subscription = {
  eventType: string;
  callback: (event: DNAEvent<SessionInReviewChangedEventPayload>) => void;
};

const { updateSessionInReview, showToast, subscriptions } = vi.hoisted(() => ({
  updateSessionInReview: vi.fn(),
  showToast: vi.fn(),
  subscriptions: [] as Subscription[],
}));

vi.mock('../api', () => ({
  apiHandler: { updateSessionInReview },
}));

vi.mock('./useDNAEvents', () => ({
  useEventSubscription: (
    eventType: string,
    callback: Subscription['callback']
  ) => {
    const existing = subscriptions.find((item) => item.eventType === eventType);
    if (existing) {
      existing.callback = callback;
      return;
    }
    subscriptions.push({ eventType, callback });
  },
}));

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast, dismissToast: vi.fn() }),
}));

function session(partial: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    project_id: '124',
    playlist_ids: ['45', '46'],
    in_review_playlist_id: null,
    in_review_version_id: null,
    in_review_pinned: false,
    ...partial,
  };
}

function renderSessionReview(
  queryClient: QueryClient,
  sessionId = 'sess-1',
  playlistId = '46'
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <NomenclatureProvider>{children}</NomenclatureProvider>
      </QueryClientProvider>
    );
  }
  return renderHook(() => useSessionSetInReview(sessionId, playlistId), {
    wrapper: Wrapper,
  });
}

describe('useSessionSetInReview', () => {
  beforeEach(() => {
    updateSessionInReview.mockReset();
    showToast.mockReset();
    subscriptions.length = 0;
  });

  it('sets in-review on the active playlist', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const updated = session({
      in_review_playlist_id: '46',
      in_review_version_id: '900',
    });
    updateSessionInReview.mockResolvedValue(updated);

    const { result } = renderSessionReview(queryClient);
    await result.current.setInReview('900');

    expect(updateSessionInReview).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      data: {
        in_review_playlist_id: '46',
        in_review_version_id: '900',
      },
    });
    expect(queryClient.getQueryData(['session', 'sess-1'])).toEqual(updated);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('clears the pin when taking over a pinned in-review', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    updateSessionInReview.mockResolvedValue(
      session({
        in_review_playlist_id: '46',
        in_review_version_id: '900',
        in_review_pinned: false,
      })
    );

    const { result } = renderSessionReview(queryClient);
    await result.current.setInReview('900', true);

    expect(updateSessionInReview).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      data: {
        in_review_playlist_id: '46',
        in_review_version_id: '900',
        in_review_pinned: false,
      },
    });
  });

  it('stops and toasts when the session in-review is pinned', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const conflict = Object.assign(new Error('pinned'), {
      response: { status: 409 },
    });
    updateSessionInReview.mockRejectedValue(conflict);

    const { result } = renderSessionReview(queryClient);
    await result.current.setInReview('900');

    expect(updateSessionInReview).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'In review is pinned' })
    );
  });

  it('sends the version id when pinning, and only the flag when unpinning', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    updateSessionInReview.mockResolvedValue(session());

    const { result } = renderSessionReview(queryClient);
    await result.current.setInReviewPinned('900', true);
    expect(updateSessionInReview).toHaveBeenLastCalledWith({
      sessionId: 'sess-1',
      data: {
        in_review_playlist_id: '46',
        in_review_version_id: '900',
        in_review_pinned: true,
      },
    });

    await result.current.setInReviewPinned('900', false);
    expect(updateSessionInReview).toHaveBeenLastCalledWith({
      sessionId: 'sess-1',
      data: { in_review_pinned: false },
    });
  });
});

describe('useSessionInReviewEvents', () => {
  beforeEach(() => {
    subscriptions.length = 0;
  });

  it('updates the cached session from session.in_review_changed', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['session', 'sess-1'], session());

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
    }
    renderHook(() => useSessionInReviewEvents('sess-1'), { wrapper: Wrapper });

    const subscription = subscriptions.find(
      (item) => item.eventType === 'session.in_review_changed'
    );
    expect(subscription).toBeDefined();

    act(() => {
      subscription!.callback({
        type: 'session.in_review_changed',
        payload: {
          session_id: 'sess-1',
          in_review_playlist_id: '46',
          in_review_version_id: '900',
          in_review_pinned: true,
        },
      });
    });

    expect(queryClient.getQueryData(['session', 'sess-1'])).toEqual(
      session({
        in_review_playlist_id: '46',
        in_review_version_id: '900',
        in_review_pinned: true,
      })
    );
  });

  it('ignores events for a different session', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['session', 'sess-1'], session());

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
    }
    renderHook(() => useSessionInReviewEvents('sess-1'), { wrapper: Wrapper });

    const subscription = subscriptions.find(
      (item) => item.eventType === 'session.in_review_changed'
    );

    act(() => {
      subscription!.callback({
        type: 'session.in_review_changed',
        payload: {
          session_id: 'sess-other',
          in_review_playlist_id: '46',
          in_review_version_id: '900',
          in_review_pinned: false,
        },
      });
    });

    expect(queryClient.getQueryData(['session', 'sess-1'])).toEqual(session());
  });
});
