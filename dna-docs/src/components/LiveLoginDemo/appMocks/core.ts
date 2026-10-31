// Stands in for @dna/core in docs demos (see plugins/dna-app-embed.ts). The
// demoed components mostly import types from it, which are erased at build
// time; the mention helpers are the real ones, which are pure functions.
export {
  MENTION_PREFETCH_ENTITY_TYPES,
  MENTION_PREFETCH_LIMIT,
  filterMentionCandidates,
  filterSearchResultsByEntityTypes,
  mentionResultKey,
  mergeMentionPrefetchResults,
  normalizeEntitySearchQuery,
} from '../../../../../frontend/packages/core/src/mentionLookup';
