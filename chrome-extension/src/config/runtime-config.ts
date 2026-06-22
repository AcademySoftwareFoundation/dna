/** Runtime transcription config passed from DNA on connect (not persisted). */

export interface TranscriptionRuntimeConfig {
  sttUrl: string;
  sttApiKey: string;
  sttModel: string;
  chunkDurationMs: number;
  language?: string;
}

let runtimeConfig: TranscriptionRuntimeConfig | null = null;

export function setRuntimeConfig(config: TranscriptionRuntimeConfig): void {
  runtimeConfig = config;
}

export function getRuntimeConfig(): TranscriptionRuntimeConfig | null {
  return runtimeConfig;
}

export function clearRuntimeConfig(): void {
  runtimeConfig = null;
}

export function requireRuntimeConfig(): TranscriptionRuntimeConfig {
  if (!runtimeConfig?.sttApiKey) {
    throw new Error('Transcription is not configured. Connect from DNA first.');
  }
  return runtimeConfig;
}

export function parseTranscriptionPayload(
  raw: Record<string, unknown>,
): TranscriptionRuntimeConfig | null {
  const sttUrl = raw.sttUrl ?? raw.stt_url;
  const sttApiKey = raw.sttApiKey ?? raw.stt_api_key;
  const sttModel = raw.sttModel ?? raw.stt_model;
  const chunkDurationMs = raw.chunkDurationMs ?? raw.chunk_duration_ms;
  const language = raw.language;

  if (
    typeof sttUrl !== 'string' ||
    typeof sttApiKey !== 'string' ||
    typeof sttModel !== 'string' ||
    typeof chunkDurationMs !== 'number'
  ) {
    return null;
  }

  return {
    sttUrl,
    sttApiKey,
    sttModel,
    chunkDurationMs,
    language: typeof language === 'string' ? language : undefined,
  };
}
