import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Version } from '@dna/core';
import { useFollowInReview } from './useFollowInReview';

function version(id: string): Version {
  return { type: 'Version', id, notes: [] };
}

const versions = [version('6991'), version('6995'), version('7012')];

describe('useFollowInReview', () => {
  it('does not change the selected version while follow is off', () => {
    const onVersionSelect = vi.fn();
    const { rerender } = renderHook(
      (props: { inReviewVersionId: string }) =>
        useFollowInReview({
          enabled: true,
          inReviewVersionId: props.inReviewVersionId,
          versions,
          selectedVersionId: '6995',
          onVersionSelect,
        }),
      { initialProps: { inReviewVersionId: '6995' } }
    );

    rerender({ inReviewVersionId: '7012' });

    expect(onVersionSelect).not.toHaveBeenCalled();
  });

  it('selects the in-review version when follow is turned on', () => {
    const onVersionSelect = vi.fn();
    const { result } = renderHook(() =>
      useFollowInReview({
        enabled: true,
        inReviewVersionId: '6991',
        versions,
        selectedVersionId: '6995',
        onVersionSelect,
      })
    );

    act(() => {
      result.current.setFollow(true);
    });

    expect(onVersionSelect).toHaveBeenCalledWith(version('6991'));
  });

  it('selects the new in-review version while follow stays on', () => {
    const onVersionSelect = vi.fn();
    const { result, rerender } = renderHook(
      (props: { inReviewVersionId: string }) =>
        useFollowInReview({
          enabled: true,
          inReviewVersionId: props.inReviewVersionId,
          versions,
          selectedVersionId: '6995',
          onVersionSelect,
        }),
      { initialProps: { inReviewVersionId: '6995' } }
    );

    act(() => {
      result.current.setFollow(true);
    });
    onVersionSelect.mockClear();

    rerender({ inReviewVersionId: '7012' });

    expect(onVersionSelect).toHaveBeenCalledWith(version('7012'));
  });

  it('leaves a manual selection in place until in-review changes again', () => {
    const onVersionSelect = vi.fn();
    const { result, rerender } = renderHook(
      (props: { inReviewVersionId: string; selectedVersionId: string }) =>
        useFollowInReview({
          enabled: true,
          inReviewVersionId: props.inReviewVersionId,
          versions,
          selectedVersionId: props.selectedVersionId,
          onVersionSelect,
        }),
      {
        initialProps: {
          inReviewVersionId: '6995',
          selectedVersionId: '6995',
        },
      }
    );

    act(() => {
      result.current.setFollow(true);
    });
    rerender({ inReviewVersionId: '6995', selectedVersionId: '7012' });

    expect(onVersionSelect).not.toHaveBeenCalled();
  });

  it('waits until the in-review version is in the list', () => {
    const onVersionSelect = vi.fn();
    const { result, rerender } = renderHook(
      (props: { versions: Version[] }) =>
        useFollowInReview({
          enabled: true,
          inReviewVersionId: '7012',
          versions: props.versions,
          selectedVersionId: '6995',
          onVersionSelect,
        }),
      { initialProps: { versions: [version('6995')] } }
    );

    act(() => {
      result.current.setFollow(true);
    });
    expect(onVersionSelect).not.toHaveBeenCalled();

    rerender({ versions });

    expect(onVersionSelect).toHaveBeenCalledWith(version('7012'));
  });
});
