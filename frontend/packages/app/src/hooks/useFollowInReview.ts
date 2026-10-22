import { useEffect, useRef, useState } from 'react';
import type { Version } from '@dna/core';

interface UseFollowInReviewParams {
  enabled: boolean;
  inReviewVersionId: string | null | undefined;
  versions: Version[];
  selectedVersionId?: string | null;
  onVersionSelect?: (version: Version) => void;
}

export function useFollowInReview({
  enabled,
  inReviewVersionId,
  versions,
  selectedVersionId,
  onVersionSelect,
}: UseFollowInReviewParams) {
  const [follow, setFollow] = useState(false);
  const lastFollowedId = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !follow) {
      lastFollowedId.current = null;
      return;
    }
    if (!inReviewVersionId || inReviewVersionId === lastFollowedId.current) {
      return;
    }

    const version = versions.find((item) => item.id === inReviewVersionId);
    if (!version) return;

    lastFollowedId.current = inReviewVersionId;
    if (version.id !== selectedVersionId) {
      onVersionSelect?.(version);
    }
  }, [
    enabled,
    follow,
    inReviewVersionId,
    versions,
    selectedVersionId,
    onVersionSelect,
  ]);

  return { follow, setFollow };
}
