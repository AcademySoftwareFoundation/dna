import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  connectTranscriptionExtension,
  getTranscriptionExtensionStatus,
  meetUrlFromId,
  pingTranscriptionExtension,
  startTranscriptionExtension,
} from './sendTranscriptionExtension';

describe('sendTranscriptionExtension', () => {
  const transcription = {
    sttUrl: 'https://stt.example/v1/audio/transcriptions',
    sttApiKey: 'secret',
    sttModel: 'whisper-1',
    chunkDurationMs: 5000,
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns no_extension_id when id is empty', async () => {
    expect(await pingTranscriptionExtension('')).toEqual({
      ok: false,
      reason: 'no_extension_id',
    });
  });

  it('returns no_chrome when chrome.runtime is missing', async () => {
    expect(await pingTranscriptionExtension('ext-id')).toEqual({
      ok: false,
      reason: 'no_chrome',
    });
  });

  it('returns ok when extension responds to PING', async () => {
    const sendMessage = vi.fn((_id: string, _msg: object, cb: (r: unknown) => void) => {
      cb({ ok: true });
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    expect(await pingTranscriptionExtension('ext-id')).toEqual({ ok: true });
  });

  it('connect sends CONNECT with playlist and backend', async () => {
    const sendMessage = vi.fn((_id: string, msg: object, cb: (r: unknown) => void) => {
      if ((msg as { type: string }).type === 'CONNECT') {
        cb({
          ok: true,
          status: 'ready',
          phase: 'ready',
          meetingId: 'abc-defg-hij',
          platform: 'google_meet',
          tabId: 1,
          playlistId: 42,
        });
      }
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    const result = await connectTranscriptionExtension({
      extensionId: 'ext-id',
      playlistId: 42,
      backendUrl: 'http://localhost:8000',
      authToken: 'token',
      transcription,
    });

    expect(result.ok).toBe(true);
    if (result.ok && 'phase' in result) {
      expect(result.meetingId).toBe('abc-defg-hij');
    }
    expect(sendMessage).toHaveBeenCalled();
  });

  it('getTranscriptionExtensionStatus parses phase', async () => {
    const sendMessage = vi.fn((_id: string, msg: object, cb: (r: unknown) => void) => {
      if ((msg as { type: string }).type === 'PING') {
        cb({ ok: true });
        return;
      }
      cb({ ok: true, phase: 'capturing', meetingId: 'abc-defg-hij' });
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    const status = await getTranscriptionExtensionStatus('ext-id', 42);
    expect(status).toMatchObject({
      ok: true,
      phase: 'capturing',
      meetingId: 'abc-defg-hij',
    });
  });

  it('startTranscriptionExtension sends START message', async () => {
    const sendMessage = vi.fn((_id: string, _msg: object, cb: (r: unknown) => void) => {
      cb({ ok: true });
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    const result = await startTranscriptionExtension({
      extensionId: 'ext-id',
      playlistId: 42,
      platform: 'google_meet',
      meetingId: 'abc-defg-hij',
      backendUrl: 'http://localhost:8000',
      authToken: 'token',
      tabId: 1,
      transcription,
    });
    expect(result).toEqual({ ok: true });
  });

  it('meetUrlFromId builds meet URL', () => {
    expect(meetUrlFromId('abc-defg-hij')).toBe(
      'https://meet.google.com/abc-defg-hij',
    );
  });
});
