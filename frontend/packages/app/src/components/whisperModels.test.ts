import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WHISPER_MODEL,
  WHISPER_MODELS,
  resolveWhisperModel,
} from './whisperModels';

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
