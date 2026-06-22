import type { TranscriptionRuntimeConfig } from '../session/types';
import {
  parseTranscriptionPayload,
  setRuntimeConfig,
  clearRuntimeConfig,
  getRuntimeConfig,
} from './runtime-config';

export type { TranscriptionRuntimeConfig };

export function applyTranscriptionFromMessage(
  message: Record<string, unknown>,
): TranscriptionRuntimeConfig | null {
  const transcription = message.transcription;
  if (!transcription || typeof transcription !== 'object') {
    return null;
  }
  const parsed = parseTranscriptionPayload(
    transcription as Record<string, unknown>,
  );
  if (parsed) {
    setRuntimeConfig(parsed);
  }
  return parsed;
}

export function resetTranscriptionConfig(): void {
  clearRuntimeConfig();
}

export function currentTranscriptionConfig(): TranscriptionRuntimeConfig | null {
  return getRuntimeConfig();
}
