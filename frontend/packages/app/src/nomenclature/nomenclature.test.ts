import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NOMENCLATURE,
  lowerTerm,
  parseNomenclatureEnv,
  resolveNomenclature,
} from './nomenclature';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveNomenclature', () => {
  it('uses DNA defaults when there are no overrides', () => {
    const t = resolveNomenclature();
    expect(t.version.singular).toBe('Version');
    expect(t.version.plural).toBe('Versions');
    expect(t.version.lower).toBe('version');
    expect(t.status.plural).toBe('Statuses');
    expect(t.productionTracking.singular).toBe('Production tracking');
    expect(t.productionTracking.lower).toBe('production tracking');
    expect(t.productionTracking.short).toBe('PT');
    expect(t.publish).toMatchObject({
      verb: 'Publish',
      past: 'Published',
      progressive: 'Publishing',
      lower: 'publish',
    });
  });

  it('merges partial overrides onto defaults', () => {
    const t = resolveNomenclature({
      version: { singular: 'Take', plural: 'Takes' },
    });
    expect(t.version.singular).toBe('Take');
    expect(t.version.lowerPlural).toBe('takes');
    expect(t.playlist).toEqual(resolveNomenclature().playlist);
    expect(t.session.singular).toBe('Session');
    expect(t.session.plural).toBe('Sessions');
    expect(t.session.lower).toBe('session');
  });

  it('renames a session and derives its plural', () => {
    const t = resolveNomenclature({ session: { singular: 'Reel' } });
    expect(t.session.plural).toBe('Reels');
    expect(t.session.lowerPlural).toBe('reels');
  });

  it('derives a plural when only the singular is overridden', () => {
    const t = resolveNomenclature({
      playlist: { singular: 'Review Session' },
      status: { singular: 'Category' },
      asset: { singular: 'Batch' },
    });
    expect(t.playlist.plural).toBe('Review Sessions');
    expect(t.status.plural).toBe('Categories');
    expect(t.asset.plural).toBe('Batches');
  });

  it('keeps an explicit plural', () => {
    const t = resolveNomenclature({
      shot: { singular: 'Setup', plural: 'Setups!' },
    });
    expect(t.shot.plural).toBe('Setups!');
  });

  it('derives past and progressive forms from a publish verb', () => {
    const t = resolveNomenclature({ publish: { verb: 'Release' } });
    expect(t.publish.past).toBe('Released');
    expect(t.publish.progressive).toBe('Releasing');
  });

  it('keeps explicit publish forms', () => {
    const t = resolveNomenclature({
      publish: { verb: 'Submit', past: 'Submitted', progressive: 'Submitting' },
    });
    expect(t.publish.past).toBe('Submitted');
    expect(t.publish.progressive).toBe('Submitting');
  });

  it('keeps brand-style production tracking casing in lowercase forms', () => {
    const t = resolveNomenclature({
      productionTracking: { singular: 'ShotGrid', short: 'SG' },
    });
    expect(t.productionTracking.lower).toBe('ShotGrid');
    expect(t.productionTracking.short).toBe('SG');
  });
});

describe('lowerTerm', () => {
  it('lowercases plain terms', () => {
    expect(lowerTerm('Production tracking')).toBe('production tracking');
    expect(lowerTerm('Review Session')).toBe('review session');
  });

  it('preserves brands and acronyms', () => {
    expect(lowerTerm('ShotGrid')).toBe('ShotGrid');
    expect(lowerTerm('PT')).toBe('PT');
  });
});

describe('entityLabel', () => {
  it('maps API and mention entity types in any casing', () => {
    const t = resolveNomenclature({
      version: { singular: 'Take', plural: 'Takes' },
      shot: { singular: 'Setup', plural: 'Setups' },
    });
    expect(t.entityLabel('Version').singular).toBe('Take');
    expect(t.entityLabel('version').plural).toBe('Takes');
    expect(t.entityLabel('Shot').singular).toBe('Setup');
    expect(t.entityLabel('asset').plural).toBe('Assets');
    expect(t.entityLabel('Playlist').singular).toBe('Playlist');
  });

  it('falls back to the raw type for unknown entities', () => {
    const t = resolveNomenclature();
    expect(t.entityLabel('User').singular).toBe('User');
    expect(t.entityLabel('user').plural).toBe('users');
    expect(t.entityLabel('Entity').singular).toBe('Entity');
  });
});

describe('parseNomenclatureEnv', () => {
  it('returns no overrides for unset or blank values', () => {
    expect(parseNomenclatureEnv(undefined)).toEqual({});
    expect(parseNomenclatureEnv('')).toEqual({});
    expect(parseNomenclatureEnv('   ')).toEqual({});
  });

  it('parses valid JSON and trims values', () => {
    expect(
      parseNomenclatureEnv(
        '{"version":{"singular":" Take ","plural":"Takes"},"publish":{"verb":"Release"}}'
      )
    ).toEqual({
      version: { singular: 'Take', plural: 'Takes' },
      publish: { verb: 'Release' },
    });
  });

  it('warns and ignores invalid JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseNomenclatureEnv('{nope')).toEqual({});
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('not valid JSON')
    );
  });

  it('warns and ignores non-object JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseNomenclatureEnv('["version"]')).toEqual({});
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('not a JSON object')
    );
  });

  it('warns about unknown terms, unknown fields and bad values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = parseNomenclatureEnv(
      JSON.stringify({
        sequence: { singular: 'Seq' },
        version: { singular: 'Take', colour: 'red', plural: 3 },
        note: 'Comment',
        status: { singular: '  ' },
      })
    );
    expect(result).toEqual({ version: { singular: 'Take' } });
    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.some((m) => m.includes('unknown term "sequence"'))).toBe(
      true
    );
    expect(
      messages.some((m) => m.includes('unknown field "version.colour"'))
    ).toBe(true);
    expect(messages.some((m) => m.includes('"version.plural"'))).toBe(true);
    expect(messages.some((m) => m.includes('"note": expected an object'))).toBe(
      true
    );
    expect(messages.some((m) => m.includes('"status.singular"'))).toBe(true);
  });
});

describe('DEFAULT_NOMENCLATURE', () => {
  it('matches the resolved defaults', () => {
    const t = resolveNomenclature();
    expect(t.note.singular).toBe(DEFAULT_NOMENCLATURE.note.singular);
  });
});
