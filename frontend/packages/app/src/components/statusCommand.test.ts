import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { SuggestionProps } from '@tiptap/suggestion';
import type { SearchResult } from '@dna/core';
import {
  filterVersionStatuses,
  StatusCommand,
  type StatusCommandAttrs,
} from './statusCommand';

const STATUSES = [
  { code: 'rev', name: 'Pending Review' },
  { code: 'apr', name: 'Approved' },
  { code: 'fin', name: 'Final Approved' },
];

const names = (query: string) =>
  filterVersionStatuses(STATUSES, query).map((s) => s.name);

describe('filterVersionStatuses', () => {
  it('offers every status for a bare slash', () => {
    expect(names('')).toHaveLength(3);
  });

  it('matches on name or code, ignoring case', () => {
    expect(names('PENDING')).toEqual(['Pending Review']);
    expect(names('rev')).toEqual(['Pending Review']);
  });

  it('puts statuses starting with the query first', () => {
    expect(names('app')).toEqual(['Approved', 'Final Approved']);
    // "rev" is Pending Review's code, so it goes ahead of the name matches.
    expect(names('r')).toEqual([
      'Pending Review',
      'Approved',
      'Final Approved',
    ]);
  });

  it('matches multi-word names and tolerates a trailing space', () => {
    expect(names('pending re')).toEqual(['Pending Review']);
    expect(names('pending ')).toEqual(['Pending Review']);
  });

  it('treats a leading space as punctuation, not a command', () => {
    expect(names(' ')).toEqual([]);
    expect(names(' app')).toEqual([]);
  });

  it('matches nothing for text that is not a status', () => {
    expect(names('proj/shots')).toEqual([]);
  });

  it('leaves the input unchanged', () => {
    const statuses = [...STATUSES];
    filterVersionStatuses(statuses, 'a');
    expect(statuses).toEqual(STATUSES);
  });
});

describe('StatusCommand', () => {
  let editor: Editor | undefined;
  afterEach(() => editor?.destroy());

  type Props = SuggestionProps<SearchResult, StatusCommandAttrs>;

  function setup({ enabled = true } = {}) {
    const onSelect = vi.fn();
    const onStart = vi.fn<(props: Props) => void>();
    const onUpdate = vi.fn<(props: Props) => void>();
    const onExit = vi.fn();
    editor = new Editor({
      extensions: [
        StarterKit,
        StatusCommand.configure({
          isEnabled: () => enabled,
          getStatuses: () => STATUSES,
          onSelect,
          render: () => ({ onStart, onUpdate, onExit }),
        }),
      ],
    });
    return { editor, onSelect, onStart, onUpdate, onExit };
  }

  // The plugin resolves its items asynchronously.
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  async function type(target: Editor, text: string) {
    target.commands.insertContent(text);
    await settle();
  }

  it('removes the typed text and reports the code when picked', async () => {
    const { editor, onSelect, onStart } = setup();
    await type(editor, 'Looks good /app');

    const { items, command } = onStart.mock.calls[0][0];
    expect(items.map((i) => i.name)).toEqual(['Approved', 'Final Approved']);

    command({ id: `status:${items[0].id}`, label: items[0].name });
    await settle();

    expect(onSelect).toHaveBeenCalledWith('apr');
    expect(editor.getText()).toBe('Looks good ');
  });

  it('reports the status before removing the text', async () => {
    const { editor, onSelect, onStart } = setup();
    let textWhenSelected: string | undefined;
    onSelect.mockImplementation(() => {
      textWhenSelected = editor.getText();
    });
    await type(editor, '/app');

    const { items, command } = onStart.mock.calls[0][0];
    command({ id: `status:${items[0].id}`, label: items[0].name });

    // A note save queued ahead of the status change would overwrite it.
    expect(textWhenSelected).toBe('/app');
    expect(editor.getText()).toBe('');
  });

  it('triggers at the start of a line', async () => {
    const { editor, onStart } = setup();
    await type(editor, '/');
    expect(onStart).toHaveBeenCalled();
  });

  it('ignores a slash inside a word', async () => {
    const { editor, onStart } = setup();
    await type(editor, 'and/or');
    expect(onStart).not.toHaveBeenCalled();
  });

  it('ignores a slash inside a code block', async () => {
    const { editor, onStart } = setup();
    editor.commands.setCodeBlock();
    await type(editor, '/app');
    expect(onStart).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', async () => {
    const { editor, onStart } = setup({ enabled: false });
    await type(editor, '/app');
    expect(onStart).not.toHaveBeenCalled();
  });
});
