/**
 * WhisperLive tuning offered in the transcription panel (extension route).
 *
 * Model names are WhisperLive's built-in `model_sizes`; anything else is
 * treated upstream as a Hugging Face repo and downloaded on first use, so the
 * list is deliberately closed. English-only variants are faster and more
 * accurate for English but WhisperLive forces `language=en` for any name
 * ending in "en", so they are swapped for a multilingual sibling when the
 * user picks another language.
 */
export const DEFAULT_WHISPER_MODEL = 'small';

export const WHISPER_MODELS: ReadonlyArray<{
  value: string;
  label: string;
  englishOnly: boolean;
  /** Multilingual model to use instead when the language is not English. */
  multilingualFallback?: string;
}> = [
  { value: 'small', label: 'Standard', englishOnly: false },
  {
    value: 'small.en',
    label: 'Standard (English only)',
    englishOnly: true,
    multilingualFallback: 'small',
  },
  { value: 'medium', label: 'Enhanced', englishOnly: false },
  {
    value: 'medium.en',
    label: 'Enhanced (English only)',
    englishOnly: true,
    multilingualFallback: 'medium',
  },
  {
    value: 'distil-large-v3',
    label: 'Best (English only)',
    englishOnly: true,
    multilingualFallback: 'large-v3-turbo',
  },
  { value: 'large-v3-turbo', label: 'Best (needs a GPU)', englishOnly: false },
];

/** Consecutive identical decode passes before WhisperLive confirms a segment. */
export const DEFAULT_CONFIRM_PASSES = 4;

/**
 * The "Performance" slider's stops, left (speed) to right (accuracy), as
 * confirm-pass counts. Fewer passes finalise text sooner but may revise a
 * word or two afterwards; more passes wait longer before locking text in.
 */
export const PERFORMANCE_STEPS: ReadonlyArray<number> = [2, 3, 4, 6, 10];

/** Slider index for a stored pass count (nearest stop; ties round toward speed). */
export function confirmPassesToPerformanceIndex(passes: number): number {
  let best = 0;
  for (let i = 1; i < PERFORMANCE_STEPS.length; i++) {
    if (
      Math.abs(PERFORMANCE_STEPS[i] - passes) <
      Math.abs(PERFORMANCE_STEPS[best] - passes)
    ) {
      best = i;
    }
  }
  return best;
}

/** Pass count for a slider index (clamped to the available stops). */
export function performanceIndexToConfirmPasses(index: number): number {
  const i = Math.min(PERFORMANCE_STEPS.length - 1, Math.max(0, Math.round(index)));
  return PERFORMANCE_STEPS[i];
}

/**
 * Pick the model actually sent to WhisperLive: an English-only choice is
 * downgraded to its multilingual sibling when the session language is not
 * English (including auto-detect), otherwise the choice is used as-is.
 */
export function resolveWhisperModel(
  model: string | null | undefined,
  language: string | null | undefined
): string {
  const chosen = model && model.trim() ? model.trim() : DEFAULT_WHISPER_MODEL;
  if (language === 'en') return chosen;
  const entry = WHISPER_MODELS.find((m) => m.value === chosen);
  if (entry?.englishOnly && entry.multilingualFallback) {
    return entry.multilingualFallback;
  }
  return chosen;
}
