// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  openProdtrackVersionInExtension,
  openProdtrackUrlInUncontrolledNewTab,
  openProdtrackVersionViaExtensionOrNewTab,
  pingProdtrackTabExtension,
} from './prodtrackTabSync';

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'chrome');
  delete document.documentElement.dataset.dnaExtensionBridge;
});

/**
 * Stands in for the extension's content-script bridge: marks the page and
 * answers `dna-page` postMessages via `respond`. Returns a teardown and the
 * messages it received.
 */
function installFakePageBridge(
  respond: (message: Record<string, unknown>) => {
    response?: unknown;
    error?: string;
  } | null
) {
  const received: Record<string, unknown>[] = [];
  const onMessage = (event: MessageEvent) => {
    const data = event.data as {
      source?: string;
      id?: string;
      message?: Record<string, unknown>;
    };
    if (data?.source !== 'dna-page' || !data.message) return;
    received.push(data.message);
    const reply = respond(data.message);
    if (reply) {
      window.postMessage(
        { source: 'dna-extension', id: data.id, ...reply },
        '*'
      );
    }
  };
  document.documentElement.dataset.dnaExtensionBridge = '1';
  window.addEventListener('message', onMessage);
  return {
    received,
    remove: () => window.removeEventListener('message', onMessage),
  };
}

describe('page bridge transport', () => {
  it('opens a version through the bridge without an extension id', async () => {
    const bridge = installFakePageBridge(() => ({
      response: { ok: true, tabId: 7 },
    }));
    const r = await openProdtrackVersionInExtension(
      '',
      'https://studio.shotgrid.autodesk.com/detail/Version/1',
      { tabId: 5 }
    );
    bridge.remove();
    expect(r).toEqual({ ok: true, tabId: 7 });
    expect(bridge.received).toEqual([
      {
        type: 'OPEN_VERSION',
        url: 'https://studio.shotgrid.autodesk.com/detail/Version/1',
        tabId: 5,
      },
    ]);
  });

  it('uses the bridge when an id is configured but chrome.runtime is missing', async () => {
    const bridge = installFakePageBridge(() => ({ response: { ok: true } }));
    const r = await pingProdtrackTabExtension(
      'abcdefghijklmnopabcdefghijklmnop'
    );
    bridge.remove();
    expect(r).toEqual({ ok: true });
    expect(bridge.received).toEqual([{ type: 'PING' }]);
  });

  it('prefers externally_connectable when an id and chrome.runtime exist', async () => {
    const bridge = installFakePageBridge(() => ({ response: { ok: true } }));
    const sendMessage = vi.fn(
      (_id: string, _msg: object, cb: (r: unknown) => void) =>
        cb({ ok: true, tabId: 3 })
    );
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: { sendMessage, lastError: undefined },
    };
    const r = await openProdtrackVersionInExtension(
      'abcdefghijklmnopabcdefghijklmnop',
      'https://a.com/b'
    );
    bridge.remove();
    expect(r).toEqual({ ok: true, tabId: 3 });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(bridge.received).toEqual([]);
  });

  it('returns error with detail when the bridge reports an error', async () => {
    const bridge = installFakePageBridge(() => ({
      error: 'Could not establish connection',
    }));
    const r = await openProdtrackVersionInExtension('', 'https://a.com/b');
    bridge.remove();
    expect(r).toEqual({
      ok: false,
      reason: 'error',
      detail: 'Could not establish connection',
    });
  });

  it('returns no_extension when the bridge does not answer in time', async () => {
    const bridge = installFakePageBridge(() => null);
    const r = await pingProdtrackTabExtension('', 20);
    bridge.remove();
    expect(r).toEqual({ ok: false, reason: 'no_extension' });
  });
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

  it('returns ok when extension responds with ok true (legacy, no tabId)', async () => {
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

  it('sends tabId in message when options include it', async () => {
    let lastMsg: object = {};
    (
      globalThis as {
        chrome?: {
          runtime: {
            sendMessage: (
              _id: string,
              msg: object,
              cb: (r: unknown) => void
            ) => void;
            lastError?: { message?: string };
          };
        };
      }
    ).chrome = {
      runtime: {
        sendMessage: (_id, msg, cb) => {
          lastMsg = msg;
          cb({ ok: true, tabId: 99 });
        },
        lastError: undefined,
      },
    };

    const r = await openProdtrackVersionInExtension(
      'abcdefghijklmnopabcdefghijklmnop',
      'https://studio.shotgrid.autodesk.com/detail/Version/1',
      { tabId: 99 }
    );
    expect(lastMsg).toEqual(
      expect.objectContaining({
        type: 'OPEN_VERSION',
        url: 'https://studio.shotgrid.autodesk.com/detail/Version/1',
        tabId: 99,
      })
    );
    expect(r).toEqual({ ok: true, tabId: 99 });
  });

  it('omits tabId from message when option is not a positive id', async () => {
    let lastMsg: object = {};
    (
      globalThis as {
        chrome?: {
          runtime: {
            sendMessage: (
              _id: string,
              msg: object,
              cb: (r: unknown) => void
            ) => void;
            lastError?: { message?: string };
          };
        };
      }
    ).chrome = {
      runtime: {
        sendMessage: (_id, msg, cb) => {
          lastMsg = msg;
          cb({ ok: true, tabId: 3 });
        },
        lastError: undefined,
      },
    };

    await openProdtrackVersionInExtension(
      'abcdefghijklmnopabcdefghijklmnop',
      'https://a.com/b',
      {
        tabId: 0,
      }
    );
    expect((lastMsg as { tabId?: number }).tabId).toBeUndefined();
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
    const open = vi
      .spyOn(window, 'open')
      .mockImplementation(() => mockWin as Window);
    openProdtrackUrlInUncontrolledNewTab('https://example.com/v/1');
    expect(open).toHaveBeenCalledWith('https://example.com/v/1', '_blank');
    expect(mockWin.opener).toBeNull();
    open.mockRestore();
  });
});

describe('openProdtrackVersionViaExtensionOrNewTab', () => {
  it('opens a new tab when the extension does not respond', async () => {
    const mockWin = { opener: {} as unknown };
    const open = vi
      .spyOn(window, 'open')
      .mockImplementation(() => mockWin as Window);
    const r = await openProdtrackVersionViaExtensionOrNewTab(
      'abcdefghijklmnopabcdefghijklmnop',
      'https://studio.shotgrid.autodesk.com/detail/Version/1'
    );
    expect(r).toEqual({ ok: false, reason: 'no_chrome' });
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
    const r = await openProdtrackVersionViaExtensionOrNewTab(
      'abcdefghijklmnopabcdefghijklmnop',
      'https://studio.shotgrid.autodesk.com/detail/Version/2'
    );
    expect(r).toEqual({ ok: true });
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
