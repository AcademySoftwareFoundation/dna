import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import type {
  DNAEvent,
  InReviewChangedEventPayload,
  PlaylistMetadata,
} from '@dna/core';
import { useInReviewChangedEvents } from './usePlaylistMetadata';

type Subscription = {
  eventType: string;
  callback: (event: DNAEvent<InReviewChangedEventPayload>) => void;
};

const { subscriptions } = vi.hoisted(() => ({
  subscriptions: [] as Subscription[],
}));

vi.mock('../contexts', () => ({
  useEventClient: () => ({
    subscribe: (
      eventType: string,
      callback: Subscription['callback']
    ) => {
      const subscription = { eventType, callback };
      subscriptions.push(subscription);
      return () => {
        const index = subscriptions.indexOf(subscription);
        if (index >= 0) {
          subscriptions.splice(index, 1);
        }
      };
    },
  }),
}));

function metadata(
  inReview: string | null,
  inReviewPinned = false
): PlaylistMetadata {
  return {
    _id: 'abc',
    playlist_id: '10',
    in_review: inReview,
    in_review_pinned: inReviewPinned,
    meeting_id: null,
    platform: null,
    transcription_paused: false,
    has_scratch: false,
    session_ids: [],
  };
}

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderInReviewEvents(
  playlistId: string | readonly string[] | null,
  queryClient: QueryClient
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return renderHook(() => useInReviewChangedEvents(playlistId), {
    wrapper: Wrapper,
  });
}

function emit(playlistId: string, inReview: string, inReviewPinned?: boolean) {
  const subscription = subscriptions.find(
    (item) => item.eventType === 'playlist.in_review_changed'
  );
  if (!subscription) {
    throw new Error('expected an in-review subscription');
  }
  act(() => {
    subscription.callback({
      type: 'playlist.in_review_changed',
      payload: {
        playlist_id: playlistId,
        in_review: inReview,
        in_review_pinned: inReviewPinned,
      },
    });
  });
}

describe('useInReviewChangedEvents', () => {
  beforeEach(() => {
    subscriptions.length = 0;
  });

  it('updates the cached in-review version for the matching playlist', () => {
    const queryClient = createClient();
    queryClient.setQueryData(['playlistMetadata', '10'], metadata('100'));

    renderInReviewEvents('10', queryClient);
    emit('10', '200');

    expect(queryClient.getQueryData(['playlistMetadata', '10'])).toEqual(
      metadata('200')
    );
  });

  it('updates the cached pin state from the event', () => {
    const queryClient = createClient();
    queryClient.setQueryData(['playlistMetadata', '10'], metadata('100'));

    renderInReviewEvents('10', queryClient);
    emit('10', '100', true);

    expect(queryClient.getQueryData(['playlistMetadata', '10'])).toEqual(
      metadata('100', true)
    );
  });

  it('keeps the cached pin state when the event omits it', () => {
    const queryClient = createClient();
    queryClient.setQueryData(['playlistMetadata', '10'], metadata('100', true));

    renderInReviewEvents('10', queryClient);
    emit('10', '100');

    expect(queryClient.getQueryData(['playlistMetadata', '10'])).toEqual(
      metadata('100', true)
    );
  });

  it('updates every playlist in a session', () => {
    const queryClient = createClient();
    queryClient.setQueryData(['playlistMetadata', '10'], metadata('100'));
    queryClient.setQueryData(['playlistMetadata', '11'], {
      ...metadata(null),
      playlist_id: '11',
    });

    renderInReviewEvents(['10', '11'], queryClient);
    emit('11', '300');

    expect(queryClient.getQueryData(['playlistMetadata', '11'])).toMatchObject({
      playlist_id: '11',
      in_review: '300',
    });
    expect(queryClient.getQueryData(['playlistMetadata', '10'])).toEqual(
      metadata('100')
    );
  });

  it('ignores events for a different playlist', () => {
    const queryClient = createClient();
    queryClient.setQueryData(['playlistMetadata', '10'], metadata('100'));

    renderInReviewEvents('10', queryClient);
    emit('99', '200');

    expect(queryClient.getQueryData(['playlistMetadata', '10'])).toEqual(
      metadata('100')
    );
  });

  it('invalidates the query when no cached metadata exists', () => {
    const queryClient = createClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    renderInReviewEvents('10', queryClient);
    emit('10', '200');

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['playlistMetadata', '10'],
    });
    expect(queryClient.getQueryData(['playlistMetadata', '10'])).toBeUndefined();
  });
});
