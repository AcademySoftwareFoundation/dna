import { useCallback, useState } from 'react';
import {
  useMutation,
  useQueries,
  useQueryClient,
  type Query,
  type QueryKey,
} from '@tanstack/react-query';
import {
  ENTITY_FIELD_LEVELS,
  isSameSelectedField,
  splitUpdate,
  withFieldValue,
} from '@dna/core';
import type {
  DNAEntity,
  EntityFieldLevel,
  SchemaField,
  SelectedEntityField,
  Version,
} from '@dna/core';
import { apiHandler } from '../api';
import { useToast } from '../contexts';

export const SELECTED_ENTITY_FIELDS_STORAGE_KEY = 'dna.versionFields';

const SCHEMA_STALE_TIME_MS = 5 * 60 * 1000;

/** Version status keeps its dedicated control, so it is not offered here. */
const EXCLUDED_FIELDS: Partial<Record<EntityFieldLevel, readonly string[]>> = {
  version: ['status'],
};

function isSelectedField(value: unknown): value is SelectedEntityField {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const { level, code } = value as Record<string, unknown>;
  return (
    typeof code === 'string' &&
    ENTITY_FIELD_LEVELS.includes(level as EntityFieldLevel)
  );
}

function loadSelectedFields(): SelectedEntityField[] {
  try {
    const raw = localStorage.getItem(SELECTED_ENTITY_FIELDS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isSelectedField) : [];
  } catch {
    return [];
  }
}

function saveSelectedFields(fields: SelectedEntityField[]): void {
  try {
    localStorage.setItem(
      SELECTED_ENTITY_FIELDS_STORAGE_KEY,
      JSON.stringify(fields)
    );
  } catch {
    // Storage can be full or unavailable; the selection still works in memory.
  }
}

export function useSelectedEntityFields() {
  const [selected, setSelected] =
    useState<SelectedEntityField[]>(loadSelectedFields);

  const update = useCallback(
    (change: (current: SelectedEntityField[]) => SelectedEntityField[]) => {
      setSelected((current) => {
        const next = change(current);
        saveSelectedFields(next);
        return next;
      });
    },
    []
  );

  const toggle = useCallback(
    (field: SelectedEntityField) =>
      update((current) =>
        current.some((item) => isSameSelectedField(item, field))
          ? current.filter((item) => !isSameSelectedField(item, field))
          : [...current, { level: field.level, code: field.code }]
      ),
    [update]
  );

  return { selected, toggle };
}

export interface EntityFieldTarget {
  entityType: string;
  entityId: string;
}

export function getFieldTargets(
  version: Version
): Partial<Record<EntityFieldLevel, EntityFieldTarget>> {
  return {
    version: { entityType: 'version', entityId: version.id },
    task: version.task
      ? { entityType: 'task', entityId: version.task.id }
      : undefined,
    entity: version.entity
      ? {
          entityType: version.entity.type.toLowerCase(),
          entityId: version.entity.id,
        }
      : undefined,
  };
}

export interface UseEntitySchemasParams {
  projectId?: string;
  /** Entity type of the version's shot/asset, for example 'Shot'. */
  entityType?: string;
  hasTask: boolean;
}

export function useEntitySchemas({
  projectId,
  entityType,
  hasTask,
}: UseEntitySchemasParams) {
  const types: Record<EntityFieldLevel, string | undefined> = {
    version: 'version',
    task: hasTask ? 'task' : undefined,
    entity: entityType?.toLowerCase(),
  };

  const results = useQueries({
    queries: ENTITY_FIELD_LEVELS.map((level) => ({
      queryKey: ['entitySchema', level, types[level], projectId],
      queryFn: () =>
        apiHandler.getEntitySchema({
          entityType: types[level]!,
          projectId,
          includeDnaFields: true,
        }),
      enabled: !!types[level],
      staleTime: SCHEMA_STALE_TIME_MS,
    })),
  });

  const schemas: Record<EntityFieldLevel, SchemaField[]> = {
    version: [],
    task: [],
    entity: [],
  };
  ENTITY_FIELD_LEVELS.forEach((level, index) => {
    const excluded = EXCLUDED_FIELDS[level] ?? [];
    schemas[level] = (results[index].data ?? []).filter(
      (field) => !excluded.includes(field.code)
    );
  });

  return {
    schemas,
    isLoading: results.some((result) => result.isLoading),
    error: results.find((result) => result.error)?.error ?? null,
  };
}

export interface UseEntityFieldValuesParams {
  version: Version;
  selected: SelectedEntityField[];
  schemas: Record<EntityFieldLevel, SchemaField[]>;
}

export function useEntityFieldValues({
  version,
  selected,
  schemas,
}: UseEntityFieldValuesParams) {
  const targets = getFieldTargets(version);

  const requests = ENTITY_FIELD_LEVELS.map((level) => {
    const target = targets[level];
    const codes = selected
      .filter((field) => field.level === level)
      .map((field) => field.code);
    const additionalFields = schemas[level]
      .filter(
        (field) => field.source === 'provider' && codes.includes(field.code)
      )
      .map((field) => field.code);
    return {
      level,
      target,
      additionalFields,
      enabled: !!target && codes.length > 0,
    };
  });

  const results = useQueries({
    queries: requests.map(({ level, target, additionalFields, enabled }) => ({
      queryKey: [
        'entityFieldValues',
        level,
        target?.entityType,
        target?.entityId,
        additionalFields,
      ],
      queryFn: () =>
        apiHandler.getEntity({
          entityType: target!.entityType,
          entityId: target!.entityId,
          additionalFields,
        }),
      enabled,
    })),
  });

  const entities: Partial<Record<EntityFieldLevel, DNAEntity>> = {};
  requests.forEach(({ level }, index) => {
    const data = results[index].data;
    if (data) {
      entities[level] = data;
    }
  });

  return {
    entities,
    isLoading: results.some((result) => result.isLoading),
    error: results.find((result) => result.error)?.error ?? null,
  };
}

export interface UpdateEntityFieldVariables {
  entityType: string;
  entityId: string;
  field: SchemaField;
  value: unknown;
}

type FieldValuesSnapshot = [QueryKey, DNAEntity | undefined][];

/**
 * Saves a field with an optimistic cache update. A failed save restores the
 * previous value and shows a toast.
 */
export function useUpdateEntityField({
  playlistId,
}: { playlistId?: string | null } = {}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const mutation = useMutation<
    DNAEntity,
    Error,
    UpdateEntityFieldVariables,
    { previous: FieldValuesSnapshot }
  >({
    mutationFn: ({ entityType, entityId, field, value }) =>
      apiHandler.updateEntity({
        entityType,
        entityId,
        ...splitUpdate(field, value),
      }),
    onMutate: async ({ entityType, entityId, field, value }) => {
      const filters = {
        queryKey: ['entityFieldValues'],
        predicate: (query: Query) =>
          query.queryKey[2] === entityType && query.queryKey[3] === entityId,
      };
      await queryClient.cancelQueries(filters);
      const previous = queryClient.getQueriesData<DNAEntity>(filters);
      queryClient.setQueriesData<DNAEntity>(
        filters,
        (entity) => entity && withFieldValue(entity, field, value)
      );
      return { previous };
    },
    onError: (error, { field }, context) => {
      context?.previous.forEach(([key, data]) =>
        queryClient.setQueryData(key, data)
      );
      showToast({
        title: `Could not save ${field.display_name}`,
        description: error.message,
        type: 'error',
      });
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entityFieldValues'] }),
        queryClient.invalidateQueries({ queryKey: ['versions', playlistId] }),
      ]);
    },
  });

  return mutation.mutate;
}
