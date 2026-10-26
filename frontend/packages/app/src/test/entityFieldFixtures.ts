import type {
  DNAEntity,
  EntityFieldLevel,
  SchemaField,
  Version,
} from '@dna/core';

export function makeField(overrides: Partial<SchemaField> = {}): SchemaField {
  return {
    code: 'sg_field',
    display_name: 'Field',
    data_type: 'text',
    editable: true,
    source: 'provider',
    ...overrides,
  };
}

export const TEST_VERSION = {
  id: '10',
  type: 'Version',
  name: 'sh010_v001',
  notes: [],
  project: { type: 'Project', id: '1' },
  task: { id: '20', type: 'Task', name: 'Comp' },
  entity: { id: '30', type: 'Shot', name: 'sh010', tasks: [] },
} as Version;

export const TEST_SCHEMAS: Record<EntityFieldLevel, SchemaField[]> = {
  version: [
    makeField({
      code: 'description',
      display_name: 'Description',
      source: 'dna',
    }),
    makeField({
      code: 'sg_qc_passed',
      display_name: 'QC Passed',
      data_type: 'checkbox',
    }),
    makeField({
      code: 'sg_review_at',
      display_name: 'Review At',
      data_type: 'date_time',
    }),
    makeField({
      code: 'notes',
      display_name: 'Notes',
      data_type: 'multi_entity',
      source: 'dna',
      editable: false,
    }),
    makeField({ code: 'sg_link', display_name: 'Link', data_type: 'url' }),
    makeField({
      code: 'sg_locked',
      display_name: 'Locked Code',
      editable: false,
    }),
  ],
  task: [
    makeField({
      code: 'sg_estimate',
      display_name: 'Estimate',
      data_type: 'duration',
    }),
    makeField({
      code: 'sg_percent',
      display_name: 'Progress',
      data_type: 'percent',
    }),
    makeField({
      code: 'sg_reviewers',
      display_name: 'Reviewers',
      data_type: 'multi_entity',
    }),
    makeField({
      code: 'status',
      display_name: 'Status',
      data_type: 'status_list',
      source: 'dna',
      acceptable_values: [
        { value: 'ip', label: 'In Progress' },
        { value: 'fin', label: 'Final' },
      ],
    }),
  ],
  entity: [
    makeField({
      code: 'sg_cut_in',
      display_name: 'Cut In',
      data_type: 'number',
    }),
    makeField({
      code: 'sg_delivery',
      display_name: 'Delivery',
      data_type: 'date',
    }),
    makeField({
      code: 'sg_sequence',
      display_name: 'Sequence',
      data_type: 'entity',
    }),
  ],
};

export const TEST_ENTITIES: Record<string, DNAEntity> = {
  version: {
    id: '10',
    type: 'Version',
    description: 'first pass',
    notes: [{ type: 'Note', id: '7', subject: 'Fix flicker' }],
    additional_fields: {
      sg_qc_passed: false,
      sg_review_at: new Date(2025, 0, 1, 9, 30).toISOString(),
      sg_link: 'https://example.com',
      sg_locked: 'LOCKED',
    },
  } as unknown as DNAEntity,
  task: {
    id: '20',
    type: 'Task',
    status: 'ip',
    additional_fields: {
      sg_estimate: 8,
      sg_percent: 40,
      sg_reviewers: [{ type: 'HumanUser', id: '1', name: 'Ada' }],
    },
  } as DNAEntity,
  shot: {
    id: '30',
    type: 'Shot',
    tasks: [],
    additional_fields: {
      sg_cut_in: 1001,
      sg_delivery: '2025-03-01',
      sg_sequence: { type: 'Sequence', id: '3', name: 'seq01' },
    },
  } as DNAEntity,
};
