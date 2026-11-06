import { describe, it, expect } from 'vitest';
import type { Version } from '@dna/core';
import {
  DEFAULT_VERSION_SORT,
  parseVersionSort,
  sortVersions,
  type VersionSortField,
} from './versionSort';

function version(id: string, fields: Partial<Version> = {}): Version {
  return { type: 'Version', id, notes: [], ...fields };
}

function withStep(id: string, name?: string): Version {
  return version(id, {
    task: {
      type: 'Task',
      id: `task-${id}`,
      pipeline_step: name ? { type: 'Step', id: name, name } : undefined,
    } as Version['task'],
  });
}

function sortedIds(
  versions: Version[],
  field: VersionSortField,
  reverse = false
): string[] {
  return sortVersions(versions, { field, reversed: reverse }).map((v) => v.id);
}

describe('sortVersions', () => {
  const named = [
    version('a', { name: 'shot_v10' }),
    version('b', { name: 'SHOT_v2' }),
    version('c', { name: 'shot_v1' }),
  ];

  it('keeps playlist order by default and reverses it on request', () => {
    expect(sortedIds(named, 'playlist')).toEqual(['a', 'b', 'c']);
    expect(sortedIds(named, 'playlist', true)).toEqual(['c', 'b', 'a']);
  });

  it('sorts names numerically and ignoring case', () => {
    expect(sortedIds(named, 'name')).toEqual(['c', 'b', 'a']);
    expect(sortedIds(named, 'name', true)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by pipeline step', () => {
    const versions = [withStep('a', 'Light'), withStep('b', 'Anim')];
    expect(sortedIds(versions, 'pipeline_step')).toEqual(['b', 'a']);
    expect(sortedIds(versions, 'pipeline_step', true)).toEqual(['a', 'b']);
  });

  it('compares dates as instants, across time zones', () => {
    const versions = [
      version('later', { created_at: '2026-10-14T12:00:00-08:00' }),
      version('earlier', { created_at: '2026-10-14T16:00:00+00:00' }),
    ];
    expect(sortedIds(versions, 'created_at')).toEqual(['earlier', 'later']);
    expect(sortedIds(versions, 'created_at', true)).toEqual([
      'later',
      'earlier',
    ]);
  });

  it('sorts by updated date independently of created date', () => {
    const versions = [
      version('a', {
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      }),
      version('b', {
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-15T00:00:00Z',
      }),
    ];
    expect(sortedIds(versions, 'created_at')).toEqual(['a', 'b']);
    expect(sortedIds(versions, 'updated_at')).toEqual(['b', 'a']);
  });

  it('puts versions missing the field last in both directions', () => {
    const versions = [
      withStep('none'),
      withStep('light', 'Light'),
      withStep('anim', 'Anim'),
    ];
    expect(sortedIds(versions, 'pipeline_step')).toEqual([
      'anim',
      'light',
      'none',
    ]);
    expect(sortedIds(versions, 'pipeline_step', true)).toEqual([
      'light',
      'anim',
      'none',
    ]);
  });

  it('treats unparseable dates as missing', () => {
    const versions = [
      version('bad', { created_at: 'not a date' }),
      version('good', { created_at: '2026-01-01T00:00:00Z' }),
    ];
    expect(sortedIds(versions, 'created_at')).toEqual(['good', 'bad']);
  });

  it('keeps ties in playlist order, and reversing mirrors them', () => {
    const versions = [
      withStep('first', 'Anim'),
      withStep('second', 'Anim'),
      withStep('third', 'Anim'),
    ];
    expect(sortedIds(versions, 'pipeline_step')).toEqual([
      'first',
      'second',
      'third',
    ]);
    expect(sortedIds(versions, 'pipeline_step', true)).toEqual([
      'third',
      'second',
      'first',
    ]);
  });

  it('does not mutate its input and preserves version identity', () => {
    const input = [...named];
    const sorted = sortVersions(input, { field: 'name', reversed: false });
    expect(input).toEqual(named);
    expect(sorted[0]).toBe(named[2]);
  });
});

describe('parseVersionSort', () => {
  it('falls back to the default for missing or malformed values', () => {
    expect(parseVersionSort(null)).toEqual(DEFAULT_VERSION_SORT);
    expect(parseVersionSort('{not json')).toEqual(DEFAULT_VERSION_SORT);
    expect(parseVersionSort('null')).toEqual(DEFAULT_VERSION_SORT);
  });

  it('round-trips a stored sort', () => {
    const sort = { field: 'created_at' as const, reversed: true };
    expect(parseVersionSort(JSON.stringify(sort))).toEqual(sort);
  });

  it('ignores unknown fields and non-boolean switches', () => {
    expect(
      parseVersionSort(JSON.stringify({ field: 'status', reversed: 'yes' }))
    ).toEqual(DEFAULT_VERSION_SORT);
  });

  it('keeps the field from the older per-field switch format', () => {
    expect(
      parseVersionSort(
        JSON.stringify({ field: 'name', reversed: { name: true } })
      )
    ).toEqual({ field: 'name', reversed: false });
  });
});
