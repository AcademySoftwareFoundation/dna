import { Extension } from '@tiptap/react';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import type { SearchResult, StatusOption } from '@dna/core';

const STATUS_ID_PREFIX = 'status:';

/** What MentionList hands back when an item is picked. */
export interface StatusCommandAttrs {
  id: string;
  label: string;
}

/**
 * Statuses matching what's been typed after the slash, by name or code, with
 * those starting with it first. MentionList takes search results, so that's
 * the shape returned. A leading space means the slash was punctuation
 * ("foo / bar"), not a command, so it matches nothing.
 */
export function filterVersionStatuses(
  statuses: StatusOption[],
  query: string
): SearchResult[] {
  if (query !== query.trimStart()) return [];

  const q = query.trimEnd().toLowerCase();
  const matches = (status: StatusOption, test: (text: string) => boolean) =>
    test(status.name.toLowerCase()) || test(status.code.toLowerCase());
  const startsWith = (status: StatusOption) =>
    matches(status, (text) => text.startsWith(q));

  return statuses
    .filter((status) => matches(status, (text) => text.includes(q)))
    .sort((a, b) => Number(startsWith(b)) - Number(startsWith(a)))
    .map((status) => ({
      type: 'status',
      id: status.code,
      name: status.name,
    }));
}

interface StatusCommandOptions {
  /** Read per keystroke, so the command can follow its props. */
  isEnabled: () => boolean;
  getStatuses: () => StatusOption[];
  onSelect: (code: string) => void;
  render?: SuggestionOptions<SearchResult, StatusCommandAttrs>['render'];
}

/**
 * Typing "/" followed by a status offers matching statuses, like @ does for
 * mentions. Picking one removes the typed text and reports the status code.
 * Spaces are allowed so multi-word statuses can be typed in full.
 */
export const StatusCommand = Extension.create<StatusCommandOptions>({
  name: 'statusCommand',

  addOptions() {
    return {
      isEnabled: () => false,
      getStatuses: () => [],
      onSelect: () => {},
    };
  },

  addProseMirrorPlugins() {
    const { isEnabled, getStatuses, onSelect, render } = this.options;
    return [
      Suggestion<SearchResult, StatusCommandAttrs>({
        editor: this.editor,
        pluginKey: new PluginKey('statusCommand'),
        char: '/',
        allowSpaces: true,
        allow: ({ state, range }) =>
          isEnabled() && !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => filterVersionStatuses(getStatuses(), query),
        command: ({ editor, range, props }) => {
          // Status first: removing the text saves the note, and a draft save
          // queued ahead of the status change would overwrite it.
          onSelect(props.id.slice(STATUS_ID_PREFIX.length));
          editor.chain().focus().deleteRange(range).run();
        },
        render,
      }),
    ];
  },
});
