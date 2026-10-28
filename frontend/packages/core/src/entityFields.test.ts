import { describe, expect, it } from 'vitest';

import {
  KNOWN_DATA_TYPES,
  coerceFieldInput,
  entityLevelLabel,
  entityValueLabels,
  fieldLabel,
  filterSchemaFields,
  formatFieldValue,
  isSameSelectedField,
  readFieldValue,
  resolveDataType,
  splitUpdate,
  toDateTimeLocalValue,
  withFieldValue,
} from './entityFields';
import type { EntityBase, SchemaField } from './interfaces';

const field = (overrides: Partial<SchemaField> = {}): SchemaField => ({
  code: 'sg_cut_in',
  display_name: 'Cut In',
  data_type: 'number',
  editable: true,
  source: 'provider',
  ...overrides,
});

describe('resolveDataType', () => {
  it.each(KNOWN_DATA_TYPES)('keeps known type %s', (dataType) => {
    expect(resolveDataType(dataType)).toBe(dataType);
  });

  it('maps unrecognised types to unknown', () => {
    expect(resolveDataType('image')).toBe('unknown');
    expect(resolveDataType('')).toBe('unknown');
  });
});

describe('filterSchemaFields', () => {
  const fields = [
    field(),
    field({ code: 'sg_cut_out', display_name: 'Cut Out' }),
    field({ code: 'description', display_name: 'Description', source: 'dna' }),
  ];

  it('returns all fields for a blank query', () => {
    expect(filterSchemaFields(fields, '   ')).toEqual(fields);
  });

  it('matches display name case-insensitively', () => {
    expect(filterSchemaFields(fields, 'CUT').map((f) => f.code)).toEqual([
      'sg_cut_in',
      'sg_cut_out',
    ]);
  });

  it('matches the field code', () => {
    expect(filterSchemaFields(fields, 'sg_cut_o').map((f) => f.code)).toEqual([
      'sg_cut_out',
    ]);
  });

  it('matches the level label prefix', () => {
    expect(filterSchemaFields(fields, 'task: cut', 'Task')).toHaveLength(2);
    expect(filterSchemaFields(fields, 'shot:', 'Task')).toEqual([]);
  });

  it('returns nothing when no field matches', () => {
    expect(filterSchemaFields(fields, 'zzz')).toEqual([]);
  });
});

describe('labels', () => {
  it('names each entity level', () => {
    expect(entityLevelLabel('version')).toBe('Version');
    expect(entityLevelLabel('task')).toBe('Task');
    expect(entityLevelLabel('entity', 'Shot')).toBe('Shot');
    expect(entityLevelLabel('entity')).toBe('Entity');
  });

  it('prefixes the field name with the level', () => {
    expect(fieldLabel('Task', field())).toBe('Task: Cut In');
  });

  it('compares selected fields by level and code', () => {
    expect(
      isSameSelectedField(
        { level: 'task', code: 'a' },
        { level: 'task', code: 'a' }
      )
    ).toBe(true);
    expect(
      isSameSelectedField(
        { level: 'task', code: 'a' },
        { level: 'entity', code: 'a' }
      )
    ).toBe(false);
  });
});

describe('splitUpdate', () => {
  it('sends DNA fields through fields', () => {
    expect(
      splitUpdate(field({ code: 'description', source: 'dna' }), 'hi')
    ).toEqual({ fields: { description: 'hi' } });
  });

  it('sends provider fields through additionalFields', () => {
    expect(splitUpdate(field(), 1001)).toEqual({
      additionalFields: { sg_cut_in: 1001 },
    });
  });
});

describe('readFieldValue', () => {
  const entity = {
    id: '1',
    type: 'Shot',
    description: 'a shot',
    additional_fields: { sg_cut_in: 1001 },
  } as unknown as EntityBase;

  it('reads DNA fields from the entity', () => {
    expect(
      readFieldValue(entity, field({ code: 'description', source: 'dna' }))
    ).toBe('a shot');
  });

  it('reads provider fields from additional_fields', () => {
    expect(readFieldValue(entity, field())).toBe(1001);
  });

  it('returns undefined for a missing entity or value', () => {
    expect(readFieldValue(undefined, field())).toBeUndefined();
    expect(
      readFieldValue({ id: '2', type: 'Shot' } as EntityBase, field())
    ).toBeUndefined();
  });
});

describe('coerceFieldInput', () => {
  it.each(['number', 'float', 'duration', 'percent', 'currency'])(
    'parses %s input as a number',
    (dataType) => {
      expect(coerceFieldInput(dataType, '12.5')).toBe(12.5);
      expect(coerceFieldInput(dataType, '')).toBeNull();
      expect(coerceFieldInput(dataType, 'abc')).toBeUndefined();
    }
  );

  it('parses checkbox input as a boolean', () => {
    expect(coerceFieldInput('checkbox', 'true')).toBe(true);
    expect(coerceFieldInput('checkbox', 'false')).toBe(false);
  });

  it('keeps date strings and clears blanks', () => {
    expect(coerceFieldInput('date', '2025-03-01')).toBe('2025-03-01');
    expect(coerceFieldInput('date', '')).toBeNull();
  });

  it('converts date_time input to ISO', () => {
    expect(coerceFieldInput('date_time', '2025-03-01T10:30')).toBe(
      new Date('2025-03-01T10:30').toISOString()
    );
    expect(coerceFieldInput('date_time', '')).toBeNull();
    expect(coerceFieldInput('date_time', 'nope')).toBeUndefined();
  });

  it.each(['text', 'url', 'uuid', 'list', 'status_list'])(
    'passes %s input through unchanged',
    (dataType) => {
      expect(coerceFieldInput(dataType, 'value')).toBe('value');
    }
  );
});

describe('toDateTimeLocalValue', () => {
  it('formats an ISO timestamp for datetime-local inputs', () => {
    const iso = new Date(2025, 2, 1, 9, 5).toISOString();
    expect(toDateTimeLocalValue(iso)).toBe('2025-03-01T09:05');
  });

  it('returns blank for missing or invalid values', () => {
    expect(toDateTimeLocalValue(undefined)).toBe('');
    expect(toDateTimeLocalValue('')).toBe('');
    expect(toDateTimeLocalValue('not a date')).toBe('');
    expect(toDateTimeLocalValue(5)).toBe('');
  });
});

describe('entity value formatting', () => {
  it('labels single entities by name, code, then id', () => {
    expect(entityValueLabels({ type: 'User', id: '1', name: 'Ada' })).toEqual([
      'Ada',
    ]);
    expect(entityValueLabels({ type: 'Shot', id: '2', code: 'sh010' })).toEqual(
      ['sh010']
    );
    expect(
      entityValueLabels({ type: 'Note', id: '4', subject: 'Fix' })
    ).toEqual(['Fix']);
    expect(entityValueLabels({ type: 'Shot', id: '3' })).toEqual(['3']);
  });

  it('labels multi-entity values', () => {
    expect(
      entityValueLabels([
        { type: 'Task', id: '1', name: 'Comp' },
        { type: 'Task', id: '2', name: 'Anim' },
      ])
    ).toEqual(['Comp', 'Anim']);
  });

  it('handles empty values and primitives', () => {
    expect(entityValueLabels(null)).toEqual([]);
    expect(entityValueLabels(undefined)).toEqual([]);
    expect(entityValueLabels([])).toEqual([]);
    expect(entityValueLabels(['a', null, 4])).toEqual(['a', '4']);
  });

  it('formats values as text', () => {
    expect(formatFieldValue(undefined)).toBe('');
    expect(formatFieldValue(null)).toBe('');
    expect(formatFieldValue(42)).toBe('42');
    expect(formatFieldValue(true)).toBe('true');
    expect(formatFieldValue({ type: 'User', id: '1', name: 'Ada' })).toBe(
      'Ada'
    );
    expect(formatFieldValue({ foo: 'bar' })).toBe('{"foo":"bar"}');
    expect(formatFieldValue([])).toBe('[]');
  });
});

describe('withFieldValue', () => {
  const entity = {
    id: '1',
    type: 'Shot',
    description: 'old',
    additional_fields: { sg_cut_in: 1, sg_cut_out: 2 },
  } as unknown as EntityBase;

  it('replaces a DNA field without mutating the original', () => {
    const next = withFieldValue(
      entity,
      field({ code: 'description', source: 'dna' }),
      'new'
    );
    expect(next).toMatchObject({ description: 'new' });
    expect((entity as unknown as { description: string }).description).toBe(
      'old'
    );
  });

  it('replaces one provider field and keeps the others', () => {
    const next = withFieldValue(entity, field(), 1001);
    expect(next.additional_fields).toEqual({ sg_cut_in: 1001, sg_cut_out: 2 });
    expect(entity.additional_fields).toEqual({ sg_cut_in: 1, sg_cut_out: 2 });
  });

  it('adds additional_fields when the entity has none', () => {
    const next = withFieldValue(
      { id: '2', type: 'Shot' } as EntityBase,
      field(),
      5
    );
    expect(next.additional_fields).toEqual({ sg_cut_in: 5 });
  });
});
