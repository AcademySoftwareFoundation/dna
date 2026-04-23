import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  openProdtrackVersionInExtension,
  openProdtrackUrlInUncontrolledNewTab,
  openProdtrackVersionViaExtensionOrNewTab,
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

describe('openProdtrackUrlInUncontrolledNewTab', () => {
  it('does nothing for non-http URLs', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    openProdtrackUrlInUncontrolledNewTab('javascript:alert(1)');
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('opens http(s) URL in a new tab and clears opener', () => {
    const mockWin = { opener: {} as unknown };
    const open = vi.spyOn(window, 'open').mockImplementation(() => mockWin as Window);
    openProdtrackUrlInUncontrolledNewTab('https://example.com/v/1');
    expect(open).toHaveBeenCalledWith('https://example.com/v/1', '_blank');
    expect(mockWin.opener).toBeNull();
    open.mockRestore();
  });
});

describe('openProdtrackVersionViaExtensionOrNewTab', () => {
  it('opens a new tab when the extension does not respond', async () => {
    const mockWin = { opener: {} as unknown };
    const open = vi.spyOn(window, 'open').mockImplementation(() => mockWin as Window);
    await openProdtrackVersionViaExtensionOrNewTab(
      'abcdefghijklmnopabcdefghijklmnop',
      'https://studio.shotgrid.autodesk.com/detail/Version/1'
    );
    expect(open).toHaveBeenCalledWith(
      'https://studio.shotgrid.autodesk.com/detail/Version/1',
      '_blank'
    );
    open.mockRestore();
  });

  it('does not open a new tab when the extension succeeds', async () => {
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
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await openProdtrackVersionViaExtensionOrNewTab(
      'abcdefghijklmnopabcdefghijklmnop',
      'https://studio.shotgrid.autodesk.com/detail/Version/2'
    );
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});

describe('pingProdtrackTabExtension', () => {
  it('returns no_extension_id when id empty', async () => {
    const r = await pingProdtrackTabExtension('');
    expect(r).toEqual({ ok: false, reason: 'no_extension_id' });
  });
});
