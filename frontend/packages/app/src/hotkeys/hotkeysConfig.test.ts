import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RESOLVED_NOMENCLATURE,
  resolveNomenclature,
} from '../nomenclature';
import { buildHotkeyActions } from './hotkeysConfig';

const HOTKEY_ACTIONS = buildHotkeyActions(DEFAULT_RESOLVED_NOMENCLATURE);

describe('buildHotkeyActions', () => {
  it('matches the default wording', () => {
    const next = HOTKEY_ACTIONS.find((a) => a.id === 'nextVersion');
    expect(next?.label).toBe('Next Version');
    expect(next?.description).toBe('Navigate to the next version');
  });

  it('applies studio terminology without changing ids or keys', () => {
    const terms = resolveNomenclature({
      version: { singular: 'Take', plural: 'Takes' },
      note: { singular: 'Comment', plural: 'Comments' },
    });
    const actions = buildHotkeyActions(terms);

    expect(actions.map((a) => a.id)).toEqual(HOTKEY_ACTIONS.map((a) => a.id));
    expect(actions.map((a) => a.defaultKeys)).toEqual(
      HOTKEY_ACTIONS.map((a) => a.defaultKeys)
    );
    expect(actions.find((a) => a.id === 'nextVersion')?.label).toBe(
      'Next Take'
    );
    expect(actions.find((a) => a.id === 'aiInsert')?.label).toBe(
      'AI Insert Comment'
    );
    expect(actions.find((a) => a.id === 'setInReview')?.description).toBe(
      'Mark the current take as in review'
    );
  });
});
