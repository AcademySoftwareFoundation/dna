import type { Version } from '@dna/core';

export const VERSION_SORT_FIELDS = [
  'playlist',
  'name',
  'pipeline_step',
  'created_at',
  'updated_at',
] as const;

export type VersionSortField = (typeof VERSION_SORT_FIELDS)[number];

export interface VersionSort {
  field: VersionSortField;
  reversed: boolean;
}

export const DEFAULT_VERSION_SORT: VersionSort = {
  field: 'playlist',
  reversed: false,
};

// Numeric so that v2 sorts before v10.
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function timestamp(value: string | undefined): number | undefined {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? undefined : parsed;
}

function sortValue(
  version: Version,
  field: Exclude<VersionSortField, 'playlist'>
): string | number | undefined {
  switch (field) {
    case 'name':
      return version.name || undefined;
    case 'pipeline_step':
      return version.task?.pipeline_step?.name || undefined;
    case 'created_at':
      return timestamp(version.created_at);
    case 'updated_at':
      return timestamp(version.updated_at);
  }
}

function compareValues(a: string | number, b: string | number): number {
  return typeof a === 'number' && typeof b === 'number'
    ? a - b
    : collator.compare(String(a), String(b));
}

/**
 * Returns a sorted copy of versions, which must be in playlist order. Ties stay
 * in playlist order, and reversing mirrors the whole result, so the switch
 * visibly flips the list even when every value is the same. Versions missing
 * the field go last either way.
 */
export function sortVersions(
  versions: Version[],
  { field, reversed }: VersionSort
): Version[] {
  if (field === 'playlist') {
    return reversed ? [...versions].reverse() : [...versions];
  }

  const keyed = versions.map((version) => ({
    version,
    value: sortValue(version, field),
  }));
  const sorted = keyed
    .flatMap(({ version, value }) =>
      value === undefined ? [] : [{ version, value }]
    )
    .sort((a, b) => compareValues(a.value, b.value))
    .map(({ version }) => version);
  const missing = keyed
    .filter(({ value }) => value === undefined)
    .map(({ version }) => version);
  return [...(reversed ? sorted.reverse() : sorted), ...missing];
}

/** Reads a stored sort, falling back to the default for anything unrecognized. */
export function parseVersionSort(stored: string | null): VersionSort {
  if (!stored) return DEFAULT_VERSION_SORT;
  try {
    const { field, reversed } = JSON.parse(stored) ?? {};
    return {
      field: VERSION_SORT_FIELDS.includes(field)
        ? field
        : DEFAULT_VERSION_SORT.field,
      reversed: reversed === true,
    };
  } catch {
    return DEFAULT_VERSION_SORT;
  }
}
