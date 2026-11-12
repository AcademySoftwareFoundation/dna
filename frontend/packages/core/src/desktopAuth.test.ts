import { describe, it, expect, vi } from 'vitest';
import {
  deliverDesktopAuth,
  getDesktopAuthBridge,
  isDesktopSignInPath,
  type DesktopAuthPayload,
} from './desktopAuth';

const payload: DesktopAuthPayload = {
  version: 2,
  token: 'artist@studio.com',
  user: { id: 'artist@studio.com', email: 'artist@studio.com', name: 'artist' },
  authProvider: 'none',
  apiBaseUrl: 'http://localhost:8000',
  project: { id: '1', name: 'Demo Show' },
  playlist: { id: '45', name: 'Monday Dailies' },
};

describe('isDesktopSignInPath', () => {
  it('matches the route with or without a trailing slash', () => {
    expect(isDesktopSignInPath('/desktop-signin')).toBe(true);
    expect(isDesktopSignInPath('/desktop-signin/')).toBe(true);
  });

  it('rejects other paths', () => {
    expect(isDesktopSignInPath('/')).toBe(false);
    expect(isDesktopSignInPath('/desktop-signin/extra')).toBe(false);
  });
});

describe('getDesktopAuthBridge', () => {
  it('returns null when no bridge is present', () => {
    expect(getDesktopAuthBridge({})).toBeNull();
  });

  it('returns null when the bridge has no signInComplete function', () => {
    const host = { dnaDesktopBridge: {} } as never;
    expect(getDesktopAuthBridge(host)).toBeNull();
  });

  it('uses globalThis by default', () => {
    expect(getDesktopAuthBridge()).toBeNull();
  });
});

describe('deliverDesktopAuth', () => {
  it('sends the JSON payload to the bridge', () => {
    const signInComplete = vi.fn();
    const delivered = deliverDesktopAuth(payload, {
      dnaDesktopBridge: { signInComplete },
    });

    expect(delivered).toBe(true);
    expect(JSON.parse(signInComplete.mock.calls[0][0])).toEqual(payload);
  });

  it('returns false without a bridge', () => {
    expect(deliverDesktopAuth(payload, {})).toBe(false);
  });
});
