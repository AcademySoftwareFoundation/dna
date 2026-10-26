import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DNAEntity, EntityBase, Version } from '@dna/core';
import { apiHandler } from '../api';
import { ToastProvider } from '../contexts';
import {
  TEST_ENTITIES,
  TEST_SCHEMAS,
  TEST_VERSION,
  makeField,
} from '../test/entityFieldFixtures';
import {
  SELECTED_ENTITY_FIELDS_STORAGE_KEY,
  getFieldTargets,
  useEntityFieldValues,
  useEntitySchemas,
  useSelectedEntityFields,
  useUpdateEntityField,
} from './useEntityFields';

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createClient()}>
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSelectedEntityFields', () => {
  const stored = () =>
    JSON.parse(localStorage.getItem(SELECTED_ENTITY_FIELDS_STORAGE_KEY)!);
  const selectedFor = (raw: string) => {
    localStorage.setItem(SELECTED_ENTITY_FIELDS_STORAGE_KEY, raw);
    return renderHook(() => useSelectedEntityFields()).result.current.selected;
  };

  it('starts empty when nothing is stored', () => {
    const { result } = renderHook(() => useSelectedEntityFields());
    expect(result.current.selected).toEqual([]);
  });

  it('loads the stored selection', () => {
    expect(
      selectedFor(JSON.stringify([{ level: 'task', code: 'sg_estimate' }]))
    ).toEqual([{ level: 'task', code: 'sg_estimate' }]);
  });

  it('ignores corrupt or malformed storage', () => {
    expect(selectedFor('{not json')).toEqual([]);
    expect(selectedFor('{"a":1}')).toEqual([]);
    expect(
      selectedFor(
        JSON.stringify([
          { level: 'task', code: 'ok' },
          { level: 'bogus', code: 'bad-level' },
          { level: 'task' },
          null,
          'text',
        ])
      )
    ).toEqual([{ level: 'task', code: 'ok' }]);
  });

  it('toggles a field on and off and persists the change', () => {
    const { result } = renderHook(() => useSelectedEntityFields());
    const field = { level: 'entity' as const, code: 'sg_cut_in' };

    act(() => result.current.toggle(field));
    expect(result.current.selected).toEqual([field]);
    expect(stored()).toEqual([field]);

    act(() => result.current.toggle(field));
    expect(result.current.selected).toEqual([]);
    expect(stored()).toEqual([]);
  });

  it('treats the same code on different levels as different fields', () => {
    const { result } = renderHook(() => useSelectedEntityFields());

    act(() => {
      result.current.toggle({ level: 'task', code: 'status' });
      result.current.toggle({ level: 'entity', code: 'status' });
    });
    expect(result.current.selected).toHaveLength(2);

    act(() => result.current.toggle({ level: 'task', code: 'status' }));
    expect(result.current.selected).toEqual([
      { level: 'entity', code: 'status' },
    ]);
  });

  it('keeps working when storage is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(
      globalThis,
      'localStorage'
    );
    const denied = () => {
      throw new Error('denied');
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: denied, setItem: denied },
    });

    try {
      const { result } = renderHook(() => useSelectedEntityFields());
      expect(result.current.selected).toEqual([]);

      act(() => result.current.toggle({ level: 'task', code: 'a' }));
      expect(result.current.selected).toEqual([{ level: 'task', code: 'a' }]);
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
    }
  });
});

describe('useEntitySchemas', () => {
  it('loads the schema for each level with DNA fields and the project', async () => {
    const spy = vi
      .spyOn(apiHandler, 'getEntitySchema')
      .mockImplementation(async ({ entityType }) => [
        makeField({ code: `${entityType}_field`, display_name: entityType }),
      ]);

    const { result } = renderHook(
      () =>
        useEntitySchemas({ projectId: '1', entityType: 'Shot', hasTask: true }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    for (const entityType of ['version', 'task', 'shot']) {
      expect(spy).toHaveBeenCalledWith({
        entityType,
        projectId: '1',
        includeDnaFields: true,
      });
    }
    expect(result.current.schemas.version[0].code).toBe('version_field');
    expect(result.current.schemas.task[0].code).toBe('task_field');
    expect(result.current.schemas.entity[0].code).toBe('shot_field');
    expect(result.current.error).toBeNull();
  });

  it('removes Version.status from the offered fields', async () => {
    vi.spyOn(apiHandler, 'getEntitySchema').mockImplementation(
      async ({ entityType }) => [
        makeField({ code: 'status', display_name: 'Status', source: 'dna' }),
        makeField({ code: `${entityType}_extra` }),
      ]
    );

    const { result } = renderHook(
      () =>
        useEntitySchemas({
          projectId: '1',
          entityType: 'Asset',
          hasTask: true,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.schemas.version.map((f) => f.code)).toEqual([
      'version_extra',
    ]);
    expect(result.current.schemas.task.map((f) => f.code)).toEqual([
      'status',
      'task_extra',
    ]);
    expect(result.current.schemas.entity.map((f) => f.code)).toEqual([
      'status',
      'asset_extra',
    ]);
  });

  it('skips levels the version does not have', async () => {
    const spy = vi.spyOn(apiHandler, 'getEntitySchema').mockResolvedValue([]);

    const { result } = renderHook(
      () => useEntitySchemas({ projectId: '1', hasTask: false }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'version' })
    );
    expect(result.current.schemas.task).toEqual([]);
    expect(result.current.schemas.entity).toEqual([]);
  });

  it('reports a schema load error', async () => {
    vi.spyOn(apiHandler, 'getEntitySchema').mockRejectedValue(
      new Error('schema failed')
    );

    const { result } = renderHook(
      () => useEntitySchemas({ projectId: '1', hasTask: false }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe('schema failed');
  });
});

describe('getFieldTargets', () => {
  it('addresses the version, task, and shot/asset', () => {
    expect(getFieldTargets(TEST_VERSION)).toEqual({
      version: { entityType: 'version', entityId: '10' },
      task: { entityType: 'task', entityId: '20' },
      entity: { entityType: 'shot', entityId: '30' },
    });
  });

  it('omits levels the version does not have', () => {
    const targets = getFieldTargets({
      ...TEST_VERSION,
      task: undefined,
      entity: undefined,
    } as Version);

    expect(targets.task).toBeUndefined();
    expect(targets.entity).toBeUndefined();
    expect(targets.version).toBeDefined();
  });
});

describe('useEntityFieldValues', () => {
  const mockEntities = () =>
    vi
      .spyOn(apiHandler, 'getEntity')
      .mockImplementation(async ({ entityType }) => TEST_ENTITIES[entityType]);

  it('fetches only the levels with selected fields', async () => {
    const spy = mockEntities();

    const { result } = renderHook(
      () =>
        useEntityFieldValues({
          version: TEST_VERSION,
          selected: [{ level: 'entity', code: 'sg_cut_in' }],
          schemas: TEST_SCHEMAS,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.entities.entity).toBeDefined());

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      entityType: 'shot',
      entityId: '30',
      additionalFields: ['sg_cut_in'],
    });
    expect(result.current.entities.version).toBeUndefined();
    expect(result.current.entities.task).toBeUndefined();
  });

  it('requests only provider fields as additional fields', async () => {
    const spy = mockEntities();

    const { result } = renderHook(
      () =>
        useEntityFieldValues({
          version: TEST_VERSION,
          selected: [
            { level: 'task', code: 'status' },
            { level: 'task', code: 'sg_estimate' },
            { level: 'version', code: 'description' },
          ],
          schemas: TEST_SCHEMAS,
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.entities.task).toBeDefined();
      expect(result.current.entities.version).toBeDefined();
    });

    expect(spy).toHaveBeenCalledWith({
      entityType: 'task',
      entityId: '20',
      additionalFields: ['sg_estimate'],
    });
    expect(spy).toHaveBeenCalledWith({
      entityType: 'version',
      entityId: '10',
      additionalFields: [],
    });
  });

  it('does not fetch when nothing is selected', () => {
    const spy = vi.spyOn(apiHandler, 'getEntity');

    const { result } = renderHook(
      () =>
        useEntityFieldValues({
          version: TEST_VERSION,
          selected: [],
          schemas: TEST_SCHEMAS,
        }),
      { wrapper }
    );

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.entities).toEqual({});
    expect(result.current.isLoading).toBe(false);
  });

  it('reports a fetch error', async () => {
    vi.spyOn(apiHandler, 'getEntity').mockRejectedValue(new Error('boom'));

    const { result } = renderHook(
      () =>
        useEntityFieldValues({
          version: TEST_VERSION,
          selected: [{ level: 'version', code: 'description' }],
          schemas: TEST_SCHEMAS,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe('boom');
  });
});

describe('useUpdateEntityField', () => {
  const UPDATED = { id: '30', type: 'Shot' } as DNAEntity;
  const shotField = makeField({ code: 'sg_cut_in', data_type: 'number' });

  function setup(playlistId?: string) {
    const client = createClient();
    client.setDefaultOptions({ queries: { gcTime: Infinity } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateEntityField({ playlistId }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      ),
    });
    return { client, result, invalidate };
  }

  const valuesKey = [
    'entityFieldValues',
    'entity',
    'shot',
    '30',
    ['sg_cut_in'],
  ];
  const shot = (cutIn: number) =>
    ({
      id: '30',
      type: 'Shot',
      additional_fields: { sg_cut_in: cutIn },
    }) as unknown as DNAEntity;

  it('sends DNA fields through fields', async () => {
    const spy = vi.spyOn(apiHandler, 'updateEntity').mockResolvedValue(UPDATED);
    const { result } = setup();

    act(() =>
      result.current({
        entityType: 'shot',
        entityId: '30',
        field: makeField({ code: 'description', source: 'dna' }),
        value: 'new text',
      })
    );

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        entityType: 'shot',
        entityId: '30',
        fields: { description: 'new text' },
      })
    );
  });

  it('sends provider fields through additionalFields', async () => {
    const spy = vi.spyOn(apiHandler, 'updateEntity').mockResolvedValue(UPDATED);
    const { result } = setup();

    act(() =>
      result.current({
        entityType: 'shot',
        entityId: '30',
        field: shotField,
        value: 1010,
      })
    );

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        entityType: 'shot',
        entityId: '30',
        additionalFields: { sg_cut_in: 1010 },
      })
    );
  });

  it('updates the cached value before the save finishes', async () => {
    vi.spyOn(apiHandler, 'updateEntity').mockImplementation(
      () => new Promise(() => undefined)
    );
    const { client, result } = setup();
    client.setQueryData(valuesKey, shot(1001));

    act(() =>
      result.current({
        entityType: 'shot',
        entityId: '30',
        field: shotField,
        value: 1010,
      })
    );

    await waitFor(() =>
      expect(
        client.getQueryData<EntityBase>(valuesKey)?.additional_fields
      ).toEqual({ sg_cut_in: 1010 })
    );
  });

  it('refreshes field values and the playlist versions after saving', async () => {
    vi.spyOn(apiHandler, 'updateEntity').mockResolvedValue(UPDATED);
    const { result, invalidate } = setup('5');

    act(() =>
      result.current({
        entityType: 'task',
        entityId: '20',
        field: makeField(),
        value: 'x',
      })
    );

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['entityFieldValues'],
      });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['versions', '5'] });
    });
  });

  it('restores the previous value when the save fails', async () => {
    vi.spyOn(apiHandler, 'updateEntity').mockRejectedValue(
      new Error('read-only')
    );
    const { client, result } = setup();
    client.setQueryData(valuesKey, shot(1001));

    act(() =>
      result.current({
        entityType: 'shot',
        entityId: '30',
        field: shotField,
        value: 1010,
      })
    );

    await waitFor(() =>
      expect(apiHandler.updateEntity).toHaveBeenCalledTimes(1)
    );
    await waitFor(() =>
      expect(
        client.getQueryData<EntityBase>(valuesKey)?.additional_fields
      ).toEqual({ sg_cut_in: 1001 })
    );
  });
});
