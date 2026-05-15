import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

const g = globalThis as typeof globalThis & {
  localStorage?: Storage;
  sessionStorage?: Storage;
};
if (!g.localStorage) {
  g.localStorage = createMockStorage();
}
if (!g.sessionStorage) {
  g.sessionStorage = createMockStorage();
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverMock;

// Cleanup after each test
afterEach(() => {
  cleanup();
});
