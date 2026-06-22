import { describe, expect, it } from 'vitest';
import {
  clearRuntimeConfig,
  getRuntimeConfig,
  parseTranscriptionPayload,
  requireRuntimeConfig,
  setRuntimeConfig,
} from '../src/config/runtime-config';

describe('runtime config', () => {
  it('stores and clears transcription settings from DNA connect payloads', () => {
    clearRuntimeConfig();
    setRuntimeConfig({
      sttUrl: 'https://stt.example/v1/audio/transcriptions',
      sttApiKey: 'secret',
      sttModel: 'whisper-1',
      chunkDurationMs: 5000,
      language: 'en',
    });

    expect(getRuntimeConfig()?.sttApiKey).toBe('secret');
    clearRuntimeConfig();
    expect(getRuntimeConfig()).toBeNull();
  });

  it('parses snake_case and camelCase transcription payloads', () => {
    expect(
      parseTranscriptionPayload({
        stt_url: 'https://stt.example/v1/audio/transcriptions',
        stt_api_key: 'secret',
        stt_model: 'whisper-1',
        chunk_duration_ms: 5000,
      }),
    ).toEqual({
      sttUrl: 'https://stt.example/v1/audio/transcriptions',
      sttApiKey: 'secret',
      sttModel: 'whisper-1',
      chunkDurationMs: 5000,
      language: undefined,
    });

    expect(
      parseTranscriptionPayload({
        sttUrl: 'https://stt.example/v1/audio/transcriptions',
        sttApiKey: 'secret',
        sttModel: 'whisper-1',
        chunkDurationMs: 5000,
        language: 'en',
      })?.language,
    ).toBe('en');
  });

  it('requires runtime config before capture starts', () => {
    clearRuntimeConfig();
    expect(() => requireRuntimeConfig()).toThrow(
      'Transcription is not configured. Connect from DNA first.',
    );
  });
});
