import { describe, it, expect, afterEach } from 'vitest';
import {
  openProdtrackVersionInExtension,
  pingProdtrackTabExtension,
} from './sendProdtrackTabSync';

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'chrome');
});

describe('openProdtrackVersionInExtension', () => {
  it('returns no_extension_id when extension id is empty', async () => {
    const r = await openProdtrackVersionInExtension(
      '   ',
      'https://studio.shotgrid.autodesk.com/detail/Version/1'
    );
    expect(r).toEqual({ ok: false, reason: 'no_extension_id' });
  });

  it('returns invalid_url when url is not http(s)', async () => {
    const r = await openProdtrackVersionInExtension('abc', 'ftp://x');
    expect(r).toEqual({ ok: false, reason: 'invalid_url' });
  });

  it('returns no_chrome when chrome.runtime is missing', async () => {
    const r = await openProdtrackVersionInExtension(
      'abcdefghijklmnopabcdefghijklmnop',
      'https://studio.shotgrid.autodesk.com/detail/Version/1'
    );
    expect(r).toEqual({ ok: false, reason: 'no_chrome' });
  });

  it('returns ok when extension responds with ok true', async () => {
    (
      globalThis as {
        chrome?: {
          runtime: {
            sendMessage: (
              _id: string,
              _msg: object,
              cb: (r: unknown) => void
            ) => void;
            lastError?: { message?: string };
          };
        };
      }
    ).chrome = {
      runtime: {
        sendMessage: (_id, _msg, cb) => {
          cb({ ok: true });
        },
        lastError: undefined,
      },
    };

    const r = await openProdtrackVersionInExtension(
      'abcdefghijklmnopabcdefghijklmnop',
      'https://studio.shotgrid.autodesk.com/detail/Version/99'
    );
    expect(r).toEqual({ ok: true });
  });
});

describe('pingProdtrackTabExtension', () => {
  it('returns no_extension_id when id empty', async () => {
    const r = await pingProdtrackTabExtension('');
    expect(r).toEqual({ ok: false, reason: 'no_extension_id' });
  });
});
