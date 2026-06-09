import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverMock;

// jsdom in this environment doesn't always expose localStorage; providers that
// read it on mount (ThemeMode, FeatureFlags) would otherwise crash every test
// that renders through the shared test harness. Polyfill it if missing.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as Record<string, unknown>).localStorage = localStorageMock;
}

// jsdom doesn't implement object URLs; components that preview blobs
// (thumbnails) create and revoke them.
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = () => 'blob:mock';
}
if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = () => {};
}

// Radix Themes reads matchMedia on mount; jsdom doesn't implement it.
if (typeof globalThis.matchMedia === 'undefined') {
  (globalThis as Record<string, unknown>).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// Cleanup after each test
afterEach(() => {
  cleanup();
});
