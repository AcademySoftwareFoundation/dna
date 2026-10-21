/**
 * Client-side constants for the transcription language setting. The list of
 * offered languages is not hardcoded here: it comes from
 * `apiHandler.getTranscriptionLanguages()`, which the backend answers from the
 * configured transcription provider. These two values mirror the backend's
 * `dna.models.transcription` constants and exist so the UI has something to
 * show before that query resolves.
 */

/** Sentinel for "let the transcriber detect the language per window". */
export const AUTO_DETECT_LANGUAGE = '';

/**
 * Fixing a language skips the detection pass on every window and prevents
 * mid-session flips, so English is the default rather than auto.
 */
export const DEFAULT_TRANSCRIPTION_LANGUAGE = 'en';
