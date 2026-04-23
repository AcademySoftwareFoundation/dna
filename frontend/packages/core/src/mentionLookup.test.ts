import { describe, expect, it } from 'vitest';
import type { SearchResult } from './interfaces';
import {
  filterMentionCandidates,
  filterSearchResultsByEntityTypes,
  mergeMentionPrefetchResults,
  mentionResultKey,
} from './mentionLookup';

describe('mentionResultKey', () => {
  it('normalizes type casing', () => {
    expect(
      mentionResultKey({ type: 'User', id: 1, name: 'A' } as SearchResult)
    ).toBe('user:1');
    expect(
      mentionResultKey({ type: 'Shot', id: 2, name: 'S' } as SearchResult)
    ).toBe('shot:2');
  });
});

describe('mergeMentionPrefetchResults', () => {
  it('concatenates batches in order and dedupes', () => {
    const u: SearchResult = { type: 'User', id: 1, name: 'Ann', email: 'a@x' };
    const s: SearchResult = { type: 'Shot', id: 10, name: 'sh_010' };
    const merged = mergeMentionPrefetchResults([[u], [s, { ...u }]]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual(u);
    expect(merged[1]).toEqual(s);
  });
});

describe('filterSearchResultsByEntityTypes', () => {
  it('keeps only requested types', () => {
    const rows: SearchResult[] = [
      { type: 'User', id: 1, name: 'A' },
      { type: 'Shot', id: 2, name: 'S' },
    ];
    expect(filterSearchResultsByEntityTypes(rows, ['user'])).toHaveLength(1);
    expect(
      filterSearchResultsByEntityTypes(rows, ['user', 'shot'])
    ).toHaveLength(2);
  });
});

describe('filterMentionCandidates', () => {
  const pool: SearchResult[] = [
    { type: 'Shot', id: 1, name: 'hero_shot' },
    { type: 'User', id: 2, name: 'Bob', email: 'bob@studio.com' },
    { type: 'User', id: 3, name: 'Carol', email: 'carol@other.org' },
  ];

  it('returns empty for blank query', () => {
    expect(filterMentionCandidates(pool, '', 10)).toEqual([]);
    expect(filterMentionCandidates(pool, '   ', 10)).toEqual([]);
  });

  it('matches name substring case-insensitively', () => {
    expect(filterMentionCandidates(pool, 'HERO', 10)).toEqual([
      { type: 'Shot', id: 1, name: 'hero_shot' },
    ]);
  });

  it('matches user email', () => {
    expect(filterMentionCandidates(pool, 'studio', 10)).toEqual([
      { type: 'User', id: 2, name: 'Bob', email: 'bob@studio.com' },
    ]);
  });

  it('ranks prefix matches on name before substring', () => {
    const mixed: SearchResult[] = [
      { type: 'Shot', id: 1, name: 'hero_ab_tail' },
      { type: 'Shot', id: 2, name: 'ab_opening' },
    ];
    expect(filterMentionCandidates(mixed, 'ab', 10).map((r) => r.id)).toEqual([
      2, 1,
    ]);
  });

  it('respects limit', () => {
    const many: SearchResult[] = Array.from({ length: 20 }, (_, i) => ({
      type: 'Shot' as const,
      id: i,
      name: `shot_${i}`,
    }));
    expect(filterMentionCandidates(many, 'shot', 5)).toHaveLength(5);
  });
});
