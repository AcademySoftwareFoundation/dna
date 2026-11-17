/**
 * Desktop sign-in handoff.
 *
 * Desktop hosts (e.g. the RV plugin) load DESKTOP_SIGNIN_PATH in an embedded
 * webview, expose a `dnaDesktopBridge` object on `window` (typically through
 * QWebChannel), and dispatch DESKTOP_BRIDGE_READY_EVENT once it is available.
 * After the user signs in and selects a show/playlist, the page passes a
 * JSON-encoded DesktopAuthPayload to `dnaDesktopBridge.signInComplete`.
 */

export const DESKTOP_SIGNIN_PATH = '/desktop-signin';
export const DESKTOP_BRIDGE_READY_EVENT = 'dna-desktop-bridge-ready';
export const DESKTOP_AUTH_PAYLOAD_VERSION = 2;

export type DesktopAuthProvider = 'none' | 'google';

export interface DesktopAuthEntityRef {
  id: string;
  name?: string;
}

export interface DesktopAuthPayload {
  version: typeof DESKTOP_AUTH_PAYLOAD_VERSION;
  token: string;
  user: { id: string; email: string; name?: string; picture?: string };
  authProvider: DesktopAuthProvider;
  apiBaseUrl: string;
  project: DesktopAuthEntityRef;
  playlist: DesktopAuthEntityRef;
}

export interface DesktopAuthBridge {
  signInComplete(payloadJson: string): unknown;
}

export interface DesktopAuthHost {
  dnaDesktopBridge?: DesktopAuthBridge;
}

export function isDesktopSignInPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === DESKTOP_SIGNIN_PATH;
}

export function getDesktopAuthBridge(
  host: DesktopAuthHost = globalThis as DesktopAuthHost
): DesktopAuthBridge | null {
  const bridge = host.dnaDesktopBridge;
  return bridge && typeof bridge.signInComplete === 'function' ? bridge : null;
}

export function deliverDesktopAuth(
  payload: DesktopAuthPayload,
  host: DesktopAuthHost = globalThis as DesktopAuthHost
): boolean {
  const bridge = getDesktopAuthBridge(host);
  if (!bridge) return false;
  bridge.signInComplete(JSON.stringify(payload));
  return true;
}
