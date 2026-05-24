import type { SearchResult, SearchableEntityType } from './interfaces';

/** Entity types prefetched in parallel for @ mentions (order preserved in merge). */
export const MENTION_PREFETCH_ENTITY_TYPES = [
  'user',
  'shot',
  'asset',
  'version',
  'task',
] as const;

export type MentionPrefetchEntityType =
  (typeof MENTION_PREFETCH_ENTITY_TYPES)[number];

export const MENTION_PREFETCH_LIMIT = 300;

/**
 * Trim and remove a leading mention-style `@` prefix so field search matches
 * TipTap mention behavior (query without trigger character).
 */
export function normalizeEntitySearchQuery(query: string): string {
  return query.trim().replace(/^@+/, '').trim();
}

export function mentionResultKey(result: SearchResult): string {
  return `${result.type.toLowerCase()}:${result.id}`;
}

/**
 * Merge per-type prefetch batches in order (user → shot → …), deduping by type+id.
 */
export function mergeMentionPrefetchResults(
  batches: SearchResult[][]
): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const batch of batches) {
    for (const r of batch) {
      const k = mentionResultKey(r);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(r);
      }
    }
  }
  return out;
}

function matchesQuery(result: SearchResult, q: string): boolean {
  const name = (result.name ?? '').toLowerCase();
  if (name.includes(q)) return true;
  if (result.type.toLowerCase() === 'user') {
    const email = (result.email ?? '').toLowerCase();
    if (email.includes(q)) return true;
  }
  return false;
}

function isPrefixMatch(result: SearchResult, q: string): boolean {
  const name = (result.name ?? '').toLowerCase();
  if (name.startsWith(q)) return true;
  if (result.type.toLowerCase() === 'user') {
    const email = (result.email ?? '').toLowerCase();
    if (email.startsWith(q)) return true;
  }
  return false;
}

/**
 * Case-insensitive substring match on name (and email for users), prefix matches first.
 */
export function filterSearchResultsByEntityTypes(
  results: SearchResult[],
  entityTypes: SearchableEntityType[]
): SearchResult[] {
  if (entityTypes.length === 0) return results;
  const allowed = new Set(entityTypes.map((t) => t.toLowerCase()));
  return results.filter((r) => allowed.has(r.type.toLowerCase()));
}

export function filterMentionCandidates(
  candidates: SearchResult[],
  query: string,
  limit: number
): SearchResult[] {
  const q = normalizeEntitySearchQuery(query).toLowerCase();
  if (!q || limit <= 0) return [];

  const prefix: SearchResult[] = [];
  const rest: SearchResult[] = [];
  for (const r of candidates) {
    if (!matchesQuery(r, q)) continue;
    if (isPrefixMatch(r, q)) prefix.push(r);
    else rest.push(r);
  }
  return [...prefix, ...rest].slice(0, limit);
}
