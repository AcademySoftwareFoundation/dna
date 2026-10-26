import type {
  EntityBase,
  EntityFieldLevel,
  SchemaField,
  SelectedEntityField,
} from './interfaces';

export const ENTITY_FIELD_LEVELS: readonly EntityFieldLevel[] = [
  'version',
  'task',
  'entity',
];

export const KNOWN_DATA_TYPES = [
  'text',
  'url',
  'uuid',
  'number',
  'float',
  'duration',
  'percent',
  'currency',
  'checkbox',
  'date',
  'date_time',
  'list',
  'status_list',
  'entity',
  'multi_entity',
] as const;

export type KnownDataType = (typeof KNOWN_DATA_TYPES)[number];
export type ResolvedDataType = KnownDataType | 'unknown';

export function resolveDataType(dataType: string): ResolvedDataType {
  return (KNOWN_DATA_TYPES as readonly string[]).includes(dataType)
    ? (dataType as KnownDataType)
    : 'unknown';
}

/** Match on the code or the "Level: Field name" label. */
export function filterSchemaFields(
  fields: SchemaField[],
  query: string,
  levelLabel = ''
): SchemaField[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return fields;
  }
  return fields.filter(
    (field) =>
      fieldLabel(levelLabel, field).toLowerCase().includes(needle) ||
      field.code.toLowerCase().includes(needle)
  );
}

export function entityLevelLabel(
  level: EntityFieldLevel,
  entityType?: string
): string {
  switch (level) {
    case 'version':
      return 'Version';
    case 'task':
      return 'Task';
    case 'entity':
      return entityType || 'Entity';
    default: {
      const unreachable: never = level;
      return unreachable;
    }
  }
}

export function fieldLabel(levelLabel: string, field: SchemaField): string {
  return `${levelLabel}: ${field.display_name}`;
}

export function isSameSelectedField(
  a: SelectedEntityField,
  b: SelectedEntityField
): boolean {
  return a.level === b.level && a.code === b.code;
}

export interface FieldUpdate {
  fields?: Record<string, unknown>;
  additionalFields?: Record<string, unknown>;
}

export function splitUpdate(field: SchemaField, value: unknown): FieldUpdate {
  return field.source === 'dna'
    ? { fields: { [field.code]: value } }
    : { additionalFields: { [field.code]: value } };
}

export function readFieldValue(
  entity: object | undefined,
  field: SchemaField
): unknown {
  if (!entity) {
    return undefined;
  }
  const record = entity as Record<string, unknown>;
  if (field.source === 'dna') {
    return record[field.code];
  }
  const additional =
    record.additional_fields as EntityBase['additional_fields'];
  return additional?.[field.code];
}

/** Return a copy of the entity with one field value replaced. */
export function withFieldValue<T extends object>(
  entity: T,
  field: SchemaField,
  value: unknown
): T {
  if (field.source === 'dna') {
    return { ...entity, [field.code]: value };
  }
  const additional = (entity as EntityBase).additional_fields;
  return {
    ...entity,
    additional_fields: { ...additional, [field.code]: value },
  };
}

const NUMERIC_TYPES: ReadonlySet<string> = new Set([
  'number',
  'float',
  'duration',
  'percent',
  'currency',
]);

/**
 * Convert raw widget input into the value sent to the API.
 * Returns `undefined` when the input cannot be represented for the data type.
 */
export function coerceFieldInput(dataType: string, raw: string): unknown {
  if (NUMERIC_TYPES.has(dataType)) {
    if (raw.trim() === '') {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  switch (dataType) {
    case 'checkbox':
      return raw === 'true';
    case 'date':
      return raw === '' ? null : raw;
    case 'date_time': {
      if (raw === '') {
        return null;
      }
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
    }
    default:
      return raw;
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Format an ISO timestamp for an `<input type="datetime-local">`. */
export function toDateTimeLocalValue(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function entityLabel(value: unknown): string {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const label = record.name ?? record.code ?? record.subject ?? record.id;
    return label === undefined || label === null ? '' : String(label);
  }
  return value === undefined || value === null ? '' : String(value);
}

/** Labels for the entities held by an entity or multi-entity value. */
export function entityValueLabels(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  const items = Array.isArray(value) ? value : [value];
  return items.map(entityLabel).filter((label) => label !== '');
}

/** Plain-text rendering of any field value, used for read-only display. */
export function formatFieldValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'object') {
    const labels = entityValueLabels(value);
    return labels.length > 0 ? labels.join(', ') : JSON.stringify(value);
  }
  return String(value);
}
