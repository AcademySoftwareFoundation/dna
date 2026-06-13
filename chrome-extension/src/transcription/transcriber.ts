export interface TranscriberConfig {
  sttUrl: string;
  sttApiKey: string;
  sttModel: string;
  language?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  segments: TranscriptionSegment[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function transcribeAudio(
  audioBlob: Blob,
  config: TranscriberConfig,
): Promise<TranscriptionResult> {
  const maxRetries = config.maxRetries ?? 3;
  const retryDelayMs = config.retryDelayMs ?? 500;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'chunk.webm');
    formData.append('model', config.sttModel);
    formData.append('response_format', 'verbose_json');
    if (config.language) {
      formData.append('language', config.language);
    }

    const response = await fetch(config.sttUrl, {
      method: 'POST',
      headers: {
        'X-API-Key': config.sttApiKey,
      },
      body: formData,
    });

    if (response.status === 503 && attempt < maxRetries - 1) {
      await sleep(retryDelayMs);
      continue;
    }

    if (!response.ok) {
      throw new Error(`STT request failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      text?: string;
      language?: string;
      segments?: Array<{ start?: number; end?: number; text?: string }>;
    };

    return {
      text: data.text ?? '',
      language: data.language,
      segments: (data.segments ?? []).map((segment) => ({
        start: segment.start ?? 0,
        end: segment.end ?? 0,
        text: segment.text ?? '',
      })),
    };
  }

  throw new Error('STT request failed after retries');
}
