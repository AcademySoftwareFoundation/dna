// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import {
  pingTranscriptionExtension,
  activateTranscriptionExtension,
  getTranscriptionExtensionStatus,
  deriveIngestWsUrl,
  type ExtensionActivationPayload,
} from './transcriptionExtension';

type SendMessage = (id: string, msg: object, cb: (r: unknown) => void) => void;

function installChrome(
  sendMessage: SendMessage,
  lastError?: { message?: string }
) {
  (
    globalThis as {
      chrome?: {
        runtime: { sendMessage: SendMessage; lastError?: { message?: string } };
      };
    }
  ).chrome = { runtime: { sendMessage, lastError } };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'chrome');
});

const EXT_ID = 'abcdefghijklmnopabcdefghijklmnop';

const validPayload: ExtensionActivationPayload = {
  dnaApiUrl: 'http://localhost:8000',
  dnaIngestWsUrl: 'ws://localhost:8000/transcription/extension/ingest',
  whisperLiveUrl: 'ws://localhost:9090',
  playlistId: 42,
  versionId: 7,
  token: 'user@test.com',
};

describe('pingTranscriptionExtension', () => {
  it('returns no_extension_id when id is empty', async () => {
    expect(await pingTranscriptionExtension('  ')).toEqual({
      ok: false,
      reason: 'no_extension_id',
    });
  });

  it('returns no_chrome when chrome.runtime is missing', async () => {
    expect(await pingTranscriptionExtension(EXT_ID)).toEqual({
      ok: false,
      reason: 'no_chrome',
    });
  });

  it('returns ok when the extension responds ok:true', async () => {
    installChrome((_id, _msg, cb) => cb({ ok: true }));
    expect(await pingTranscriptionExtension(EXT_ID)).toEqual({ ok: true });
  });

  it('sends the PING_TRANSCRIPTION message type', async () => {
    let sent: object = {};
    installChrome((_id, msg, cb) => {
      sent = msg;
      cb({ ok: true });
    });
    await pingTranscriptionExtension(EXT_ID);
    expect(sent).toEqual({ type: 'PING_TRANSCRIPTION' });
  });

  it('returns no_extension when the response is not ok', async () => {
    installChrome((_id, _msg, cb) => cb({ ok: false }));
    expect(await pingTranscriptionExtension(EXT_ID)).toEqual({
      ok: false,
      reason: 'no_extension',
    });
  });

  it('returns no_extension with detail on lastError', async () => {
    installChrome((_id, _msg, cb) => cb(undefined), {
      message: 'Could not establish connection',
    });
    const r = await pingTranscriptionExtension(EXT_ID);
    expect(r).toMatchObject({ ok: false, reason: 'no_extension' });
  });
});

describe('activateTranscriptionExtension', () => {
  it('returns no_extension_id when id empty', async () => {
    expect(await activateTranscriptionExtension('', validPayload)).toEqual({
      ok: false,
      reason: 'no_extension_id',
    });
  });

  it('returns invalid_payload when playlistId is not a number', async () => {
    const bad = { ...validPayload, playlistId: NaN };
    expect(await activateTranscriptionExtension(EXT_ID, bad)).toEqual({
      ok: false,
      reason: 'invalid_payload',
    });
  });

  it('returns invalid_payload when a URL is missing', async () => {
    const bad = { ...validPayload, whisperLiveUrl: '' };
    expect(await activateTranscriptionExtension(EXT_ID, bad)).toEqual({
      ok: false,
      reason: 'invalid_payload',
    });
  });

  it('returns no_chrome when chrome.runtime is missing', async () => {
    expect(await activateTranscriptionExtension(EXT_ID, validPayload)).toEqual({
      ok: false,
      reason: 'no_chrome',
    });
  });

  it('sends ACTIVATE_TRANSCRIPTION with the full payload and returns ok', async () => {
    let sent: Record<string, unknown> = {};
    installChrome((_id, msg, cb) => {
      sent = msg as Record<string, unknown>;
      cb({ ok: true });
    });
    const r = await activateTranscriptionExtension(EXT_ID, validPayload);
    expect(r).toEqual({ ok: true });
    expect(sent.type).toBe('ACTIVATE_TRANSCRIPTION');
    expect(sent.playlistId).toBe(42);
    expect(sent.whisperLiveUrl).toBe('ws://localhost:9090');
    expect(sent.token).toBe('user@test.com');
  });

  it('returns error with detail on lastError', async () => {
    installChrome((_id, _msg, cb) => cb(undefined), { message: 'boom' });
    const r = await activateTranscriptionExtension(EXT_ID, validPayload);
    expect(r).toEqual({ ok: false, reason: 'error', detail: 'boom' });
  });

  it('returns no_extension when the response is not ok', async () => {
    installChrome((_id, _msg, cb) => cb({ ok: false }));
    expect(await activateTranscriptionExtension(EXT_ID, validPayload)).toEqual({
      ok: false,
      reason: 'no_extension',
    });
  });
});

describe('getTranscriptionExtensionStatus', () => {
  it('returns null when id empty', async () => {
    expect(await getTranscriptionExtensionStatus('')).toBeNull();
  });

  it('returns null when chrome.runtime missing', async () => {
    expect(await getTranscriptionExtensionStatus(EXT_ID)).toBeNull();
  });

  it('parses a valid status response', async () => {
    installChrome((_id, _msg, cb) =>
      cb({ ok: true, connection: 'connected', meetTabId: 5, detail: 'ok' })
    );
    expect(await getTranscriptionExtensionStatus(EXT_ID)).toEqual({
      connection: 'connected',
      meetTabId: 5,
      detail: 'ok',
    });
  });

  it('returns null for an unknown connection value', async () => {
    installChrome((_id, _msg, cb) => cb({ ok: true, connection: 'weird' }));
    expect(await getTranscriptionExtensionStatus(EXT_ID)).toBeNull();
  });

  it('returns null when response is not ok', async () => {
    installChrome((_id, _msg, cb) =>
      cb({ ok: false, connection: 'connected' })
    );
    expect(await getTranscriptionExtensionStatus(EXT_ID)).toBeNull();
  });
});

describe('deriveIngestWsUrl', () => {
  it('converts http to ws and appends the ingest path', () => {
    expect(deriveIngestWsUrl('http://localhost:8000')).toBe(
      'ws://localhost:8000/transcription/extension/ingest'
    );
  });

  it('converts https to wss', () => {
    expect(deriveIngestWsUrl('https://dna.example.com')).toBe(
      'wss://dna.example.com/transcription/extension/ingest'
    );
  });

  it('strips trailing slashes', () => {
    expect(deriveIngestWsUrl('http://localhost:8000/')).toBe(
      'ws://localhost:8000/transcription/extension/ingest'
    );
  });

  it('returns empty string for empty input', () => {
    expect(deriveIngestWsUrl('')).toBe('');
  });
});
