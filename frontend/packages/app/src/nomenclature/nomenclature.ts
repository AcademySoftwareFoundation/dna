export const NOUN_KEYS = [
  'version',
  'playlist',
  'project',
  'shot',
  'asset',
  'task',
  'note',
  'status',
  'productionTracking',
] as const;

export type NounKey = (typeof NOUN_KEYS)[number];
export type TermKey = NounKey | 'publish';

export const TERM_KEYS: readonly TermKey[] = [...NOUN_KEYS, 'publish'];

export interface NounForms {
  singular: string;
  plural: string;
}

export interface ProductionTrackingForms extends NounForms {
  short: string;
}

export interface PublishForms {
  verb: string;
  past: string;
  progressive: string;
}

export interface NomenclatureConfig {
  version: NounForms;
  playlist: NounForms;
  project: NounForms;
  shot: NounForms;
  asset: NounForms;
  task: NounForms;
  note: NounForms;
  status: NounForms;
  productionTracking: ProductionTrackingForms;
  publish: PublishForms;
}

export type NomenclatureOverrides = {
  [K in TermKey]?: Partial<NomenclatureConfig[K]>;
};

export interface ResolvedNoun extends NounForms {
  lower: string;
  lowerPlural: string;
}

export interface ResolvedProductionTracking extends ResolvedNoun {
  short: string;
}

export interface ResolvedPublish extends PublishForms {
  lower: string;
  lowerPast: string;
  lowerProgressive: string;
}

export interface ResolvedNomenclature {
  version: ResolvedNoun;
  playlist: ResolvedNoun;
  project: ResolvedNoun;
  shot: ResolvedNoun;
  asset: ResolvedNoun;
  task: ResolvedNoun;
  note: ResolvedNoun;
  status: ResolvedNoun;
  productionTracking: ResolvedProductionTracking;
  publish: ResolvedPublish;
  entityLabel: (type: string) => ResolvedNoun;
}

export const DEFAULT_NOMENCLATURE: NomenclatureConfig = {
  version: { singular: 'Version', plural: 'Versions' },
  playlist: { singular: 'Playlist', plural: 'Playlists' },
  project: { singular: 'Project', plural: 'Projects' },
  shot: { singular: 'Shot', plural: 'Shots' },
  asset: { singular: 'Asset', plural: 'Assets' },
  task: { singular: 'Task', plural: 'Tasks' },
  note: { singular: 'Note', plural: 'Notes' },
  status: { singular: 'Status', plural: 'Statuses' },
  productionTracking: {
    singular: 'Production tracking',
    plural: 'Production tracking',
    short: 'PT',
  },
  publish: { verb: 'Publish', past: 'Published', progressive: 'Publishing' },
};

const ALLOWED_FIELDS: Record<TermKey, readonly string[]> = {
  version: ['singular', 'plural'],
  playlist: ['singular', 'plural'],
  project: ['singular', 'plural'],
  shot: ['singular', 'plural'],
  asset: ['singular', 'plural'],
  task: ['singular', 'plural'],
  note: ['singular', 'plural'],
  status: ['singular', 'plural'],
  productionTracking: ['singular', 'plural', 'short'],
  publish: ['verb', 'past', 'progressive'],
};

/**
 * Lowercase a term for use mid-sentence. Terms with an uppercase letter after
 * the first character of a word (brands and acronyms such as "ShotGrid" or
 * "PT") are returned unchanged.
 */
export function lowerTerm(term: string): string {
  const isBrandOrAcronym = term
    .split(/\s+/)
    .some((word) => /[A-Z]/.test(word.slice(1)));
  return isBrandOrAcronym ? term : term.toLowerCase();
}

function pluralize(word: string): string {
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

function toPast(verb: string): string {
  return /e$/i.test(verb) ? `${verb}d` : `${verb}ed`;
}

function toProgressive(verb: string): string {
  return /[^e]e$/i.test(verb) ? `${verb.slice(0, -1)}ing` : `${verb}ing`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTermKey(key: string): key is TermKey {
  return (TERM_KEYS as readonly string[]).includes(key);
}

const WARN_PREFIX = '[nomenclature] VITE_NOMENCLATURE:';

/**
 * Parse the VITE_NOMENCLATURE JSON string into overrides. Invalid JSON,
 * unknown terms, unknown fields and non-string or blank values are ignored
 * with a console warning.
 */
export function parseNomenclatureEnv(
  raw: string | undefined
): NomenclatureOverrides {
  if (!raw || !raw.trim()) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`${WARN_PREFIX} ignoring value that is not valid JSON.`);
    return {};
  }
  if (!isRecord(parsed)) {
    console.warn(`${WARN_PREFIX} ignoring value that is not a JSON object.`);
    return {};
  }

  const overrides: Record<string, Record<string, string>> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!isTermKey(key)) {
      console.warn(
        `${WARN_PREFIX} ignoring unknown term "${key}". ` +
          `Known terms: ${TERM_KEYS.join(', ')}.`
      );
      continue;
    }
    if (!isRecord(value)) {
      console.warn(`${WARN_PREFIX} ignoring "${key}": expected an object.`);
      continue;
    }
    const fields: Record<string, string> = {};
    for (const [field, text] of Object.entries(value)) {
      if (!ALLOWED_FIELDS[key].includes(field)) {
        console.warn(
          `${WARN_PREFIX} ignoring unknown field "${key}.${field}". ` +
            `Known fields: ${ALLOWED_FIELDS[key].join(', ')}.`
        );
        continue;
      }
      if (typeof text !== 'string' || !text.trim()) {
        console.warn(
          `${WARN_PREFIX} ignoring "${key}.${field}": expected a non-empty string.`
        );
        continue;
      }
      fields[field] = text.trim();
    }
    if (Object.keys(fields).length > 0) overrides[key] = fields;
  }
  return overrides as NomenclatureOverrides;
}

function resolveNoun(forms: NounForms): ResolvedNoun {
  return {
    ...forms,
    lower: lowerTerm(forms.singular),
    lowerPlural: lowerTerm(forms.plural),
  };
}

function mergeNoun<T extends NounForms>(
  defaults: T,
  override: Partial<T> | undefined
): T {
  const merged = { ...defaults, ...override };
  if (override?.singular && !override.plural) {
    merged.plural = pluralize(override.singular);
  }
  return merged;
}

function mergePublish(override: Partial<PublishForms> | undefined) {
  const merged = { ...DEFAULT_NOMENCLATURE.publish, ...override };
  if (override?.verb) {
    if (!override.past) merged.past = toPast(override.verb);
    if (!override.progressive) {
      merged.progressive = toProgressive(override.verb);
    }
  }
  return merged;
}

const ENTITY_TYPE_TO_NOUN: Record<
  string,
  Exclude<NounKey, 'productionTracking'>
> = {
  version: 'version',
  playlist: 'playlist',
  project: 'project',
  shot: 'shot',
  asset: 'asset',
  task: 'task',
  note: 'note',
};

/**
 * Merge overrides onto the DNA defaults. A singular-only noun override gets a
 * derived plural, and a verb-only publish override gets derived past and
 * progressive forms.
 */
export function resolveNomenclature(
  overrides: NomenclatureOverrides = {}
): ResolvedNomenclature {
  const nouns = {
    version: resolveNoun(
      mergeNoun(DEFAULT_NOMENCLATURE.version, overrides.version)
    ),
    playlist: resolveNoun(
      mergeNoun(DEFAULT_NOMENCLATURE.playlist, overrides.playlist)
    ),
    project: resolveNoun(
      mergeNoun(DEFAULT_NOMENCLATURE.project, overrides.project)
    ),
    shot: resolveNoun(mergeNoun(DEFAULT_NOMENCLATURE.shot, overrides.shot)),
    asset: resolveNoun(mergeNoun(DEFAULT_NOMENCLATURE.asset, overrides.asset)),
    task: resolveNoun(mergeNoun(DEFAULT_NOMENCLATURE.task, overrides.task)),
    note: resolveNoun(mergeNoun(DEFAULT_NOMENCLATURE.note, overrides.note)),
    status: resolveNoun(
      mergeNoun(DEFAULT_NOMENCLATURE.status, overrides.status)
    ),
  };

  const productionTrackingForms = mergeNoun(
    DEFAULT_NOMENCLATURE.productionTracking,
    overrides.productionTracking
  );
  const productionTracking: ResolvedProductionTracking = {
    ...resolveNoun(productionTrackingForms),
    short: productionTrackingForms.short,
  };

  const publishForms = mergePublish(overrides.publish);
  const publish: ResolvedPublish = {
    ...publishForms,
    lower: lowerTerm(publishForms.verb),
    lowerPast: lowerTerm(publishForms.past),
    lowerProgressive: lowerTerm(publishForms.progressive),
  };

  const entityLabel = (type: string): ResolvedNoun => {
    const key = ENTITY_TYPE_TO_NOUN[type.toLowerCase()];
    if (key) return nouns[key];
    return resolveNoun({ singular: type, plural: pluralize(type) });
  };

  return { ...nouns, productionTracking, publish, entityLabel };
}

export const DEFAULT_RESOLVED_NOMENCLATURE = resolveNomenclature();
