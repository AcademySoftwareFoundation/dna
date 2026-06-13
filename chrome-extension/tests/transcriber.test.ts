import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { transcribeAudio } from '../src/transcription/transcriber';

describe('transcribeAudio', () => {
  const config = {
    sttUrl: 'https://stt.example/v1/audio/transcriptions',
    sttApiKey: 'test-key',
    sttModel: 'whisper-1',
    language: 'en',
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends multipart form with OpenAI-compatible fields', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          text: 'hello',
          language: 'en',
          segments: [{ start: 0, end: 1, text: 'hello' }],
        }),
        { status: 200 },
      ),
    );

    const blob = new Blob(['audio'], { type: 'audio/webm' });
    await transcribeAudio(blob, config);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(config.sttUrl);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['X-API-Key']).toBe(
      'test-key',
    );
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('response_format')).toBe('verbose_json');
  });

  it('parses verbose_json transcription response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          text: 'hello world',
          language: 'en',
          segments: [{ start: 0, end: 2.5, text: 'hello world' }],
        }),
        { status: 200 },
      ),
    );

    const result = await transcribeAudio(new Blob(['audio']), config);
    expect(result.text).toBe('hello world');
    expect(result.language).toBe('en');
    expect(result.segments).toHaveLength(1);
  });

  it('retries on 503 then succeeds', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ text: 'ok', language: 'en', segments: [] }),
          { status: 200 },
        ),
      );

    const result = await transcribeAudio(new Blob(['audio']), {
      ...config,
      maxRetries: 2,
      retryDelayMs: 0,
    });
    expect(result.text).toBe('ok');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
