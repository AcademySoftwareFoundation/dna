import { useMemo } from 'react';
import type { Version } from '@dna/core';
import { sortVersions } from '../components/versionSort';
import { useVersionSort } from '../contexts';

/**
 * Applies the user's sort. Everything order-sensitive (the version list,
 * next/previous, publish, export) reads through this so they can't disagree.
 */
export function useSortedVersions(
  versions: Version[] | undefined
): Version[] | undefined {
  const { sort } = useVersionSort();
  return useMemo(
    () => (versions ? sortVersions(versions, sort) : undefined),
    [versions, sort]
  );
}
