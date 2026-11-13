import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { ApiHandler } from './apiHandler';

vi.mock('axios', () => {
  const handlers: {
    request?: (config: Record<string, unknown>) => unknown;
    responseError?: (error: unknown) => unknown;
  } = {};
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
    interceptors: {
      request: {
        use: (fn: (config: Record<string, unknown>) => unknown) => {
          handlers.request = fn;
        },
      },
      response: {
        use: (
          _ok: unknown,
          err: (error: unknown) => unknown
        ) => {
          handlers.responseError = err;
        },
      },
    },
  };
  return {
    default: {
      create: () => instance,
      __handlers: handlers,
      __instance: instance,
    },
  };
});

describe('ApiHandler auth headers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends X-User-Id as the user email', () => {
    const handler = new ApiHandler({ baseURL: 'http://localhost:8000' });
    handler.setUser({
      id: 'google-sub',
      email: 'artist@studio.com',
      token: 'tok',
    });
    const axiosMock = axios as unknown as {
      __handlers: {
        request: (config: Record<string, unknown>) => {
          headers: Record<string, string>;
        };
      };
    };
    const config = axiosMock.__handlers.request({
      headers: {} as Record<string, string>,
    });
    expect(config.headers.Authorization).toBe('Bearer tok');
    expect(config.headers['X-User-Id']).toBe('artist@studio.com');
  });

  it('retries once after a successful refresh on 401', async () => {
    const handler = new ApiHandler({ baseURL: 'http://localhost:8000' });
    handler.setUser({
      id: 'artist@studio.com',
      email: 'artist@studio.com',
      token: 'old',
    });
    const refresh = vi.fn().mockResolvedValue('new-token');
    handler.setAuthRefreshHandler(refresh);

    const axiosMock = axios as unknown as {
      __handlers: {
        responseError: (error: unknown) => Promise<unknown>;
      };
      __instance: {
        request: ReturnType<typeof vi.fn>;
      };
    };
    axiosMock.__instance.request.mockResolvedValue({ data: { ok: true } });

    const result = await axiosMock.__handlers.responseError({
      response: { status: 401 },
      config: {
        url: '/projects/user/artist@studio.com',
        headers: {},
      },
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(axiosMock.__instance.request).toHaveBeenCalled();
    expect(result).toEqual({ data: { ok: true } });
  });
});
