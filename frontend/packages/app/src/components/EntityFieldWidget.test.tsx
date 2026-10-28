import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KNOWN_DATA_TYPES } from '@dna/core';
import type { SchemaField } from '@dna/core';
import { render } from '../test/render';
import { EntityFieldWidget } from './EntityFieldWidget';

const LABEL = 'Task: Field';

function makeField(overrides: Partial<SchemaField> = {}): SchemaField {
  return {
    code: 'sg_field',
    display_name: 'Field',
    data_type: 'text',
    editable: true,
    source: 'provider',
    ...overrides,
  };
}

function renderWidget(field: SchemaField, value: unknown, onCommit = vi.fn()) {
  render(
    <EntityFieldWidget
      field={field}
      value={value}
      label={LABEL}
      onCommit={onCommit}
    />
  );
  return onCommit;
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

describe('EntityFieldWidget text-like types', () => {
  it.each(['text', 'url', 'uuid'])(
    'commits edited %s text on blur',
    (dataType) => {
      const onCommit = renderWidget(makeField({ data_type: dataType }), 'old');
      const input = screen.getByLabelText(LABEL);

      expect(input).toHaveValue('old');
      fireEvent.change(input, { target: { value: 'new' } });
      expect(onCommit).not.toHaveBeenCalled();
      fireEvent.blur(input);

      expect(onCommit).toHaveBeenCalledWith('new');
    }
  );

  it('commits on Enter', () => {
    const onCommit = renderWidget(makeField(), 'old');
    const input = screen.getByLabelText(LABEL);

    fireEvent.change(input, { target: { value: 'entered' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith('entered');
  });

  it('does not commit when the value is unchanged', () => {
    const onCommit = renderWidget(makeField(), 'same');

    fireEvent.blur(screen.getByLabelText(LABEL));

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('shows an empty input for a missing value', () => {
    renderWidget(makeField(), undefined);
    expect(screen.getByLabelText(LABEL)).toHaveValue('');
  });
});

describe('EntityFieldWidget numeric types', () => {
  it.each(['number', 'float', 'duration', 'percent', 'currency'])(
    'commits %s input as a number',
    (dataType) => {
      const onCommit = renderWidget(makeField({ data_type: dataType }), 10);
      const input = screen.getByLabelText(LABEL);

      expect(input).toHaveAttribute('type', 'number');
      expect(input).toHaveValue(10);
      fireEvent.change(input, { target: { value: '12.5' } });
      fireEvent.blur(input);

      expect(onCommit).toHaveBeenCalledWith(12.5);
    }
  );

  it('commits null when the number is cleared', () => {
    const onCommit = renderWidget(makeField({ data_type: 'number' }), 10);
    const input = screen.getByLabelText(LABEL);

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith(null);
  });
});

describe('EntityFieldWidget checkbox', () => {
  it('toggles and commits a boolean', async () => {
    const user = userEvent.setup();
    const onCommit = renderWidget(makeField({ data_type: 'checkbox' }), false);
    const checkbox = screen.getByRole('checkbox', { name: LABEL });

    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);

    expect(onCommit).toHaveBeenCalledWith(true);
  });

  it('unchecks a checked box', async () => {
    const user = userEvent.setup();
    const onCommit = renderWidget(makeField({ data_type: 'checkbox' }), true);
    const checkbox = screen.getByRole('checkbox', { name: LABEL });

    expect(checkbox).toBeChecked();
    await user.click(checkbox);

    expect(onCommit).toHaveBeenCalledWith(false);
  });
});

describe('EntityFieldWidget date types', () => {
  it('commits a date string', () => {
    const onCommit = renderWidget(
      makeField({ data_type: 'date' }),
      '2025-01-01'
    );
    const input = screen.getByLabelText(LABEL);

    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveValue('2025-01-01');
    fireEvent.change(input, { target: { value: '2025-02-03' } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith('2025-02-03');
  });

  it('clears a date with null', () => {
    const onCommit = renderWidget(
      makeField({ data_type: 'date' }),
      '2025-01-01'
    );
    const input = screen.getByLabelText(LABEL);

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it('commits a date_time as an ISO timestamp', () => {
    const stored = new Date(2025, 0, 1, 9, 30).toISOString();
    const onCommit = renderWidget(
      makeField({ data_type: 'date_time' }),
      stored
    );
    const input = screen.getByLabelText(LABEL);

    expect(input).toHaveAttribute('type', 'datetime-local');
    expect(input).toHaveValue('2025-01-01T09:30');
    fireEvent.change(input, { target: { value: '2025-02-03T10:45' } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith(
      new Date('2025-02-03T10:45').toISOString()
    );
  });
});

describe('EntityFieldWidget choice types', () => {
  const acceptable_values = [
    { value: 'ip', label: 'In Progress' },
    { value: 'fin', label: 'Final' },
  ];

  it.each(['list', 'status_list'])(
    'selects a %s option and commits its value',
    async (dataType) => {
      const user = userEvent.setup();
      const onCommit = renderWidget(
        makeField({ data_type: dataType, acceptable_values }),
        'ip'
      );

      const trigger = screen.getByRole('combobox', { name: LABEL });
      expect(trigger).toHaveTextContent('In Progress');
      await user.click(trigger);
      await user.click(await screen.findByRole('option', { name: 'Final' }));

      expect(onCommit).toHaveBeenCalledWith('fin');
    }
  );

  it('clears the choice with None', async () => {
    const user = userEvent.setup();
    const onCommit = renderWidget(
      makeField({ data_type: 'list', acceptable_values }),
      'ip'
    );

    await user.click(screen.getByRole('combobox', { name: LABEL }));
    await user.click(await screen.findByRole('option', { name: 'None' }));

    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it('keeps a stored value that is not an acceptable option', async () => {
    renderWidget(makeField({ data_type: 'list', acceptable_values }), 'legacy');

    expect(screen.getByRole('combobox', { name: LABEL })).toHaveTextContent(
      'legacy'
    );
  });

  it('falls back to a text input when no values are acceptable', () => {
    const onCommit = renderWidget(
      makeField({ data_type: 'list', acceptable_values: [] }),
      'a'
    );
    const input = screen.getByLabelText(LABEL);

    fireEvent.change(input, { target: { value: 'b' } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith('b');
  });
});

describe('EntityFieldWidget entity types', () => {
  it('shows a single entity as a read-only pill', () => {
    renderWidget(makeField({ data_type: 'entity' }), {
      type: 'Shot',
      id: '1',
      name: 'sh010',
    });

    expect(screen.getByLabelText(LABEL)).toHaveTextContent('sh010');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows each multi-entity value as a pill', () => {
    renderWidget(makeField({ data_type: 'multi_entity' }), [
      { type: 'Task', id: '1', name: 'Comp' },
      { type: 'Task', id: '2', name: 'Anim' },
    ]);

    expect(screen.getByText('Comp')).toBeInTheDocument();
    expect(screen.getByText('Anim')).toBeInTheDocument();
  });

  it('shows None for an empty entity value', () => {
    renderWidget(makeField({ data_type: 'entity' }), null);
    expect(screen.getByLabelText(LABEL)).toHaveTextContent('None');
  });
});

describe('EntityFieldWidget unknown types', () => {
  it('renders unrecognised types as read-only text', () => {
    renderWidget(makeField({ data_type: 'image' }), 'thumb.png');

    expect(screen.getByLabelText(LABEL)).toHaveTextContent('thumb.png');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows None when there is no value', () => {
    renderWidget(makeField({ data_type: 'image' }), undefined);
    expect(screen.getByLabelText(LABEL)).toHaveTextContent('None');
  });
});

describe('EntityFieldWidget read-only fields', () => {
  it.each(KNOWN_DATA_TYPES)(
    'never renders an editable control for non-editable %s',
    (dataType) => {
      renderWidget(
        makeField({
          data_type: dataType,
          editable: false,
          acceptable_values: [{ value: 'a', label: 'A' }],
        }),
        'a'
      );

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.getByLabelText(LABEL)).toBeInTheDocument();
    }
  );

  it('shows Yes and No for read-only checkboxes', () => {
    const { unmount } = render(
      <EntityFieldWidget
        field={makeField({ data_type: 'checkbox', editable: false })}
        value={true}
        label={LABEL}
        onCommit={vi.fn()}
      />
    );
    expect(screen.getByLabelText(LABEL)).toHaveTextContent('Yes');
    unmount();

    renderWidget(makeField({ data_type: 'checkbox', editable: false }), false);
    expect(screen.getByLabelText(LABEL)).toHaveTextContent('No');
  });

  it('shows the label of a read-only choice', () => {
    renderWidget(
      makeField({
        data_type: 'status_list',
        editable: false,
        acceptable_values: [{ value: 'fin', label: 'Final' }],
      }),
      'fin'
    );

    expect(screen.getByLabelText(LABEL)).toHaveTextContent('Final');
  });
});
