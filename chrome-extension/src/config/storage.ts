export interface ExtensionConfig {
  dnaBackendUrl: string;
  dnaAuthToken: string;
  sttUrl: string;
  sttApiKey: string;
  sttModel: string;
  chunkDurationMs: number;
  language?: string;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  dnaBackendUrl: 'http://localhost:8000',
  dnaAuthToken: '',
  sttUrl: 'https://transcription.vexa.ai/v1/audio/transcriptions',
  sttApiKey: '',
  sttModel: 'whisper-1',
  chunkDurationMs: 5000,
  language: 'en',
};

const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG) as Array<keyof ExtensionConfig>;

export function validateConfig(
  config: Partial<ExtensionConfig>,
): { ok: true } | { ok: false; error: string } {
  try {
    if (config.dnaBackendUrl) {
      new URL(config.dnaBackendUrl);
    }
    if (config.sttUrl) {
      new URL(config.sttUrl);
    }
  } catch {
    return { ok: false, error: 'Invalid URL in configuration' };
  }

  if (!config.dnaBackendUrl || !config.sttUrl) {
    return { ok: false, error: 'DNA backend URL and STT URL are required' };
  }

  return { ok: true };
}

export async function loadConfig(): Promise<ExtensionConfig> {
  const stored = await chrome.storage.sync.get(CONFIG_KEYS);
  return { ...DEFAULT_CONFIG, ...stored } as ExtensionConfig;
}

export async function saveConfig(config: ExtensionConfig): Promise<void> {
  const validation = validateConfig(config);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  await chrome.storage.sync.set(config);
}
