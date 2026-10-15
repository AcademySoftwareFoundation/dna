import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIRM_PASSES,
  DEFAULT_WHISPER_MODEL,
  PERFORMANCE_STEPS,
  WHISPER_MODELS,
  confirmPassesToPerformanceIndex,
  performanceIndexToConfirmPasses,
  resolveWhisperModel,
} from './whisperModels';

describe('performance slider mapping', () => {
  it('round-trips every stop', () => {
    PERFORMANCE_STEPS.forEach((passes, i) => {
      expect(confirmPassesToPerformanceIndex(passes)).toBe(i);
      expect(performanceIndexToConfirmPasses(i)).toBe(passes);
    });
  });

  it('has the default in the middle so the slider starts centred', () => {
    expect(PERFORMANCE_STEPS).toContain(DEFAULT_CONFIRM_PASSES);
    expect(confirmPassesToPerformanceIndex(DEFAULT_CONFIRM_PASSES)).toBe(
      Math.floor(PERFORMANCE_STEPS.length / 2)
    );
  });

  it('snaps stored values that are not a stop to the nearest one', () => {
    expect(confirmPassesToPerformanceIndex(1)).toBe(0); // below range → speed
    expect(confirmPassesToPerformanceIndex(5)).toBe(2); // tie 4/6 → speed side
    expect(confirmPassesToPerformanceIndex(8)).toBe(3); // nearer 6 than 10
    expect(confirmPassesToPerformanceIndex(20)).toBe(4); // above range → accuracy
  });

  it('clamps out-of-range slider indices', () => {
    expect(performanceIndexToConfirmPasses(-3)).toBe(PERFORMANCE_STEPS[0]);
    expect(performanceIndexToConfirmPasses(99)).toBe(
      PERFORMANCE_STEPS[PERFORMANCE_STEPS.length - 1]
    );
  });
});

describe('resolveWhisperModel', () => {
  it('uses the chosen model as-is for English', () => {
    expect(resolveWhisperModel('medium.en', 'en')).toBe('medium.en');
    expect(resolveWhisperModel('small', 'en')).toBe('small');
  });

  it('downgrades English-only models when the language is not English', () => {
    expect(resolveWhisperModel('small.en', 'es')).toBe('small');
    expect(resolveWhisperModel('medium.en', 'fr')).toBe('medium');
    expect(resolveWhisperModel('distil-large-v3', 'ja')).toBe('large-v3-turbo');
  });

  it('treats auto-detect ("" / null) as not-English', () => {
    expect(resolveWhisperModel('small.en', '')).toBe('small');
    expect(resolveWhisperModel('small.en', null)).toBe('small');
  });

  it('leaves multilingual models alone regardless of language', () => {
    expect(resolveWhisperModel('medium', 'de')).toBe('medium');
    expect(resolveWhisperModel('large-v3-turbo', '')).toBe('large-v3-turbo');
  });

  it('falls back to the default when no model is set', () => {
    expect(resolveWhisperModel(null, 'en')).toBe(DEFAULT_WHISPER_MODEL);
    expect(resolveWhisperModel('  ', 'es')).toBe(DEFAULT_WHISPER_MODEL);
  });

  it('every English-only option declares a multilingual fallback', () => {
    for (const m of WHISPER_MODELS) {
      if (m.englishOnly) expect(m.multilingualFallback).toBeTruthy();
    }
  });
});
