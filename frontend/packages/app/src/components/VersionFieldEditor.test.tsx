import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DNAEntity, SelectedEntityField, Version } from '@dna/core';
import { render } from '../test/render';
import { HotkeysProvider } from '../hotkeys';
import { apiHandler } from '../api';
import { SELECTED_ENTITY_FIELDS_STORAGE_KEY } from '../hooks';
import {
  TEST_ENTITIES,
  TEST_SCHEMAS,
  TEST_VERSION,
} from '../test/entityFieldFixtures';
import { VersionFieldEditor } from './VersionFieldEditor';
import { VersionHeader } from './VersionHeader';

const pending = <T,>() => new Promise<T>(() => undefined);

function seed(fields: SelectedEntityField[]) {
  localStorage.setItem(
    SELECTED_ENTITY_FIELDS_STORAGE_KEY,
    JSON.stringify(fields)
  );
}

function storedSelection() {
  return JSON.parse(localStorage.getItem(SELECTED_ENTITY_FIELDS_STORAGE_KEY)!);
}

function renderEditor(version: Version = TEST_VERSION) {
  return render(<VersionFieldEditor version={version} playlistId="5" />);
}

async function openPicker() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add fields' }));
  return user;
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(apiHandler, 'getVersionStatuses').mockResolvedValue([]);
  vi.spyOn(apiHandler, 'getEntitySchema').mockImplementation(
    async ({ entityType }) =>
      entityType === 'version'
        ? TEST_SCHEMAS.version
        : entityType === 'task'
          ? TEST_SCHEMAS.task
          : TEST_SCHEMAS.entity
  );
  vi.spyOn(apiHandler, 'getEntity').mockImplementation(
    async ({ entityType }) => TEST_ENTITIES[entityType]
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('field picker', () => {
  it('requests schemas for the version, task, and shot with DNA fields', async () => {
    renderEditor();

    await waitFor(() =>
      expect(apiHandler.getEntitySchema).toHaveBeenCalledTimes(3)
    );
    for (const entityType of ['version', 'task', 'shot']) {
      expect(apiHandler.getEntitySchema).toHaveBeenCalledWith({
        entityType,
        projectId: '1',
        includeDnaFields: true,
      });
    }
  });

  it('opens a dropdown with a search box and fields grouped by level', async () => {
    renderEditor();
    await openPicker();

    expect(screen.getByLabelText('Search fields')).toBeInTheDocument();
    for (const level of ['Version', 'Task', 'Shot']) {
      expect(await screen.findByRole('group', { name: level })).toBeVisible();
    }
    for (const label of [
      'Version: Description',
      'Version: QC Passed',
      'Task: Estimate',
      'Task: Status',
      'Shot: Cut In',
      'Shot: Delivery',
    ]) {
      expect(screen.getByRole('checkbox', { name: label })).toBeInTheDocument();
    }
  });

  it('does not offer the version status field', async () => {
    vi.mocked(apiHandler.getEntitySchema).mockImplementation(
      async ({ entityType }) =>
        entityType === 'version'
          ? [
              ...TEST_SCHEMAS.version,
              {
                code: 'status',
                display_name: 'Status',
                data_type: 'status_list',
                editable: true,
                source: 'dna',
              },
            ]
          : []
    );
    renderEditor();
    await openPicker();

    expect(
      await screen.findByRole('checkbox', { name: 'Version: Description' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Version: Status' })
    ).not.toBeInTheDocument();
  });

  it('filters the list as you type', async () => {
    renderEditor();
    const user = await openPicker();
    await screen.findByRole('checkbox', { name: 'Shot: Cut In' });

    await user.type(screen.getByLabelText('Search fields'), 'cut');

    expect(
      screen.getByRole('checkbox', { name: 'Shot: Cut In' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Task: Estimate' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Version' })
    ).not.toBeInTheDocument();
  });

  it('matches the entity level prefix as well as the field name', async () => {
    renderEditor();
    const user = await openPicker();
    await screen.findByRole('checkbox', { name: 'Shot: Cut In' });

    await user.type(screen.getByLabelText('Search fields'), 'task:');

    expect(
      screen.getByRole('checkbox', { name: 'Task: Estimate' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Shot: Cut In' })
    ).not.toBeInTheDocument();
  });

  it('shows a message when nothing matches', async () => {
    renderEditor();
    const user = await openPicker();
    await screen.findByRole('checkbox', { name: 'Shot: Cut In' });

    await user.type(screen.getByLabelText('Search fields'), 'zzz');

    expect(screen.getByText('No matching fields')).toBeInTheDocument();
  });

  it('shows a loading message while schemas load', async () => {
    vi.mocked(apiHandler.getEntitySchema).mockImplementation(() => pending());
    renderEditor();
    await openPicker();

    expect(screen.getByText('Loading fields...')).toBeInTheDocument();
  });

  it('clears the search when the dropdown closes', async () => {
    renderEditor();
    const user = await openPicker();
    await user.type(screen.getByLabelText('Search fields'), 'cut');

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Add fields' }));

    expect(screen.getByLabelText('Search fields')).toHaveValue('');
  });

  it('adds a field to the header and saves the selection', async () => {
    renderEditor();
    const user = await openPicker();

    await user.click(
      await screen.findByRole('checkbox', { name: 'Shot: Cut In' })
    );

    expect(
      await screen.findByRole('spinbutton', { name: 'Shot: Cut In' })
    ).toHaveValue(1001);
    expect(apiHandler.getEntity).toHaveBeenCalledWith({
      entityType: 'shot',
      entityId: '30',
      additionalFields: ['sg_cut_in'],
    });
    expect(storedSelection()).toEqual([{ level: 'entity', code: 'sg_cut_in' }]);
  });

  it('marks saved fields as checked', async () => {
    seed([{ level: 'task', code: 'sg_estimate' }]);
    renderEditor();
    await openPicker();

    const group = await screen.findByRole('group', { name: 'Task' });
    expect(
      within(group).getByRole('checkbox', { name: 'Task: Estimate' })
    ).toBeChecked();
  });
});

describe('field rows', () => {
  it('labels each row with its entity level and shows the current value', async () => {
    seed([
      { level: 'version', code: 'description' },
      { level: 'task', code: 'sg_estimate' },
      { level: 'entity', code: 'sg_cut_in' },
    ]);
    renderEditor();

    expect(await screen.findByLabelText('Version: Description')).toHaveValue(
      'first pass'
    );
    expect(screen.getByLabelText('Task: Estimate')).toHaveValue(8);
    expect(screen.getByLabelText('Shot: Cut In')).toHaveValue(1001);
    expect(screen.getByText('Shot: Cut In')).toBeInTheDocument();
  });

  it('shows entity values as read-only pills', async () => {
    seed([
      { level: 'task', code: 'sg_reviewers' },
      { level: 'entity', code: 'sg_sequence' },
    ]);
    renderEditor();

    expect(await screen.findByLabelText('Task: Reviewers')).toHaveTextContent(
      'Ada'
    );
    expect(screen.getByLabelText('Shot: Sequence')).toHaveTextContent('seq01');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows linked DNA model fields as read-only pills', async () => {
    seed([{ level: 'version', code: 'notes' }]);
    renderEditor();

    expect(await screen.findByLabelText('Version: Notes')).toHaveTextContent(
      'Fix flicker'
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows non-editable fields as read-only text', async () => {
    seed([{ level: 'version', code: 'sg_locked' }]);
    renderEditor();

    expect(
      await screen.findByLabelText('Version: Locked Code')
    ).toHaveTextContent('LOCKED');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('skips fields missing from the schema and levels without a target', async () => {
    seed([
      { level: 'version', code: 'no_such_field' },
      { level: 'task', code: 'sg_estimate' },
      { level: 'version', code: 'description' },
    ]);
    renderEditor({ ...TEST_VERSION, task: undefined } as Version);

    expect(await screen.findByText('Version: Description')).toBeInTheDocument();
    expect(screen.queryByText('Task: Estimate')).not.toBeInTheDocument();
    expect(screen.queryByText(/no_such_field/)).not.toBeInTheDocument();
  });

  it('shows a loading state until the entity values arrive', async () => {
    seed([{ level: 'task', code: 'sg_estimate' }]);
    vi.mocked(apiHandler.getEntity).mockImplementation(() => pending());
    renderEditor();

    expect(await screen.findByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByLabelText('Task: Estimate')).not.toBeInTheDocument();
  });

  it('has no remove button on rows', async () => {
    seed([{ level: 'entity', code: 'sg_cut_in' }]);
    renderEditor();

    await screen.findByLabelText('Shot: Cut In');
    expect(
      screen.queryByRole('button', { name: /^Remove/ })
    ).not.toBeInTheDocument();
  });

  it('shows the new value straight away while the save is pending', async () => {
    seed([{ level: 'entity', code: 'sg_cut_in' }]);
    vi.spyOn(apiHandler, 'updateEntity').mockImplementation(
      () => new Promise(() => undefined)
    );
    renderEditor();

    const input = await screen.findByLabelText('Shot: Cut In');
    fireEvent.change(input, { target: { value: '1010' } });
    fireEvent.blur(input);

    await waitFor(() => expect(input).toHaveValue(1010));
    expect(input).toBeEnabled();
    expect(screen.queryByLabelText('Saving')).not.toBeInTheDocument();
  });

  it('restores the old value and shows a toast when saving fails', async () => {
    seed([{ level: 'version', code: 'description' }]);
    vi.spyOn(apiHandler, 'updateEntity').mockRejectedValue(
      new Error('read-only')
    );
    renderEditor();

    const input = await screen.findByLabelText('Version: Description');
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);

    expect(
      await screen.findByText('Could not save Description')
    ).toBeInTheDocument();
    expect(screen.getByText('read-only')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('Version: Description')).toHaveValue(
        'first pass'
      )
    );
  });
});

describe('editing by data type', () => {
  const typeAndBlur = (label: string, value: string) => async () => {
    const input = await screen.findByLabelText(label);
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
  };

  const cases: {
    name: string;
    selected: SelectedEntityField;
    edit: (user: ReturnType<typeof userEvent.setup>) => Promise<void>;
    expected: Record<string, unknown>;
  }[] = [
    {
      name: 'text on a DNA field',
      selected: { level: 'version', code: 'description' },
      edit: typeAndBlur('Version: Description', 'second pass'),
      expected: {
        entityType: 'version',
        entityId: '10',
        fields: { description: 'second pass' },
      },
    },
    {
      name: 'url on a provider field',
      selected: { level: 'version', code: 'sg_link' },
      edit: typeAndBlur('Version: Link', 'https://example.org'),
      expected: {
        entityType: 'version',
        entityId: '10',
        additionalFields: { sg_link: 'https://example.org' },
      },
    },
    {
      name: 'checkbox',
      selected: { level: 'version', code: 'sg_qc_passed' },
      edit: async (user) =>
        user.click(
          await screen.findByRole('checkbox', { name: 'Version: QC Passed' })
        ),
      expected: {
        entityType: 'version',
        entityId: '10',
        additionalFields: { sg_qc_passed: true },
      },
    },
    {
      name: 'date_time',
      selected: { level: 'version', code: 'sg_review_at' },
      edit: typeAndBlur('Version: Review At', '2025-02-03T10:45'),
      expected: {
        entityType: 'version',
        entityId: '10',
        additionalFields: {
          sg_review_at: new Date('2025-02-03T10:45').toISOString(),
        },
      },
    },
    {
      name: 'duration',
      selected: { level: 'task', code: 'sg_estimate' },
      edit: typeAndBlur('Task: Estimate', '12'),
      expected: {
        entityType: 'task',
        entityId: '20',
        additionalFields: { sg_estimate: 12 },
      },
    },
    {
      name: 'percent',
      selected: { level: 'task', code: 'sg_percent' },
      edit: typeAndBlur('Task: Progress', '75.5'),
      expected: {
        entityType: 'task',
        entityId: '20',
        additionalFields: { sg_percent: 75.5 },
      },
    },
    {
      name: 'status_list on a DNA field',
      selected: { level: 'task', code: 'status' },
      edit: async (user) => {
        await user.click(
          await screen.findByRole('combobox', { name: 'Task: Status' })
        );
        await user.click(await screen.findByRole('option', { name: 'Final' }));
      },
      expected: {
        entityType: 'task',
        entityId: '20',
        fields: { status: 'fin' },
      },
    },
    {
      name: 'number on the shot',
      selected: { level: 'entity', code: 'sg_cut_in' },
      edit: typeAndBlur('Shot: Cut In', '1010'),
      expected: {
        entityType: 'shot',
        entityId: '30',
        additionalFields: { sg_cut_in: 1010 },
      },
    },
    {
      name: 'date on the shot',
      selected: { level: 'entity', code: 'sg_delivery' },
      edit: typeAndBlur('Shot: Delivery', '2025-04-01'),
      expected: {
        entityType: 'shot',
        entityId: '30',
        additionalFields: { sg_delivery: '2025-04-01' },
      },
    },
  ];

  it.each(cases)(
    'sends the right PATCH for $name',
    async ({ selected, edit, expected }) => {
      const user = userEvent.setup();
      const spy = vi
        .spyOn(apiHandler, 'updateEntity')
        .mockResolvedValue({ id: 'x' } as DNAEntity);
      seed([selected]);
      renderEditor();

      await edit(user);

      await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
      expect(spy).toHaveBeenCalledWith(expected);
    }
  );
});

describe('VersionHeader', () => {
  const renderHeader = (version: Version | null) =>
    render(
      <HotkeysProvider>
        <VersionHeader
          shotCode="sh010"
          versionNumber="v001"
          projectId="1"
          version={version}
          playlistId="5"
        />
      </HotkeysProvider>
    );

  it('shows no field picker without a version', () => {
    renderHeader(null);
    expect(
      screen.queryByRole('button', { name: 'Add fields' })
    ).not.toBeInTheDocument();
  });

  it('shows the field editor and saved fields next to the version info', async () => {
    seed([{ level: 'task', code: 'sg_estimate' }]);
    renderHeader(TEST_VERSION);

    expect(
      screen.getByRole('button', { name: 'Add fields' })
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('Task: Estimate')).toHaveValue(8);
  });
});
