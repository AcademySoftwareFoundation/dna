import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig, saveConfig, validateConfig } from '../src/config/storage';

const storage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    sync: {
      get: vi.fn(async (keys: string | string[]) => {
        if (typeof keys === 'string') {
          return { [keys]: storage[keys] };
        }
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          result[key] = storage[key];
        }
        return result;
      }),
      set: vi.fn(async (values: Record<string, unknown>) => {
        Object.assign(storage, values);
      }),
    },
  },
});

describe('config storage', () => {
  beforeEach(() => {
    Object.keys(storage).forEach((key) => delete storage[key]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('validates required URLs', () => {
    expect(validateConfig({ dnaBackendUrl: 'not-a-url' }).ok).toBe(false);
    expect(
      validateConfig({
        dnaBackendUrl: 'http://localhost:8000',
        sttUrl: 'https://stt.example/v1/audio/transcriptions',
      }).ok,
    ).toBe(true);
  });

  it('loads and saves configuration', async () => {
    await saveConfig({
      dnaBackendUrl: 'http://localhost:8000',
      dnaAuthToken: 'token',
      sttUrl: 'https://stt.example/v1/audio/transcriptions',
      sttApiKey: 'key',
      sttModel: 'whisper-1',
      chunkDurationMs: 5000,
      language: 'en',
    });

    const loaded = await loadConfig();
    expect(loaded.dnaBackendUrl).toBe('http://localhost:8000');
    expect(loaded.sttApiKey).toBe('key');
  });
});
