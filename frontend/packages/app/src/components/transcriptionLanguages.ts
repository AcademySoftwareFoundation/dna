/**
 * Languages offered in the transcription panel. Values are the ISO 639-1
 * codes Whisper (and therefore both Vexa and WhisperLive) accept; the empty
 * string means "let Whisper detect per window".
 *
 * Fixing a language skips the detection pass on every window and prevents
 * mid-session flips, so English is the default rather than auto.
 */
export const AUTO_DETECT_LANGUAGE = '';

export const DEFAULT_TRANSCRIPTION_LANGUAGE = 'en';

export const TRANSCRIPTION_LANGUAGES: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
  { value: 'hi', label: 'Hindi' },
  { value: AUTO_DETECT_LANGUAGE, label: 'Auto-detect' },
];
