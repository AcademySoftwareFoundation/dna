import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen } from '../test/render';
import userEvent from '@testing-library/user-event';
import { PublishNotesDialog } from './PublishNotesDialog';
import type { DraftNote, Version } from '@dna/core';
import { useDraftNote } from '../hooks/useDraftNote';

const mockPublishNotes = vi.fn();
const mockReset = vi.fn();

vi.mock('../hooks/usePublishNotes', () => ({
  usePublishNotes: () => ({
    mutate: mockPublishNotes,
    isPending: false,
    isError: false,
    error: null,
    data: null,
    reset: mockReset,
  }),
}));

vi.mock('../hooks/useDraftNote');

vi.mock('../hooks/useNoteQCChecks', () => ({
  useNoteQCChecks: () => ({
    results: {},
    loading: false,
    ignored: new Set<string>(),
    toggleIgnore: vi.fn(),
    refreshDraft: vi.fn().mockResolvedValue(undefined),
    hasBlockingErrors: vi.fn(() => false),
    refreshingDraftKey: null,
  }),
}));

vi.mock('./NoteEditor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./NoteEditor')>();
  return {
    ...actual,
    NoteEditor: () => <div data-testid="note-editor">NoteEditor</div>,
  };
});

vi.mock('./UserAvatar', () => ({
  UserAvatar: ({ name }: { name?: string }) => <span data-testid="avatar">{name}</span>,
}));

const mockedUseDraftNote = vi.mocked(useDraftNote);

function draft(over: Partial<DraftNote> = {}): DraftNote {
  return {
    _id: 'id1',
    user_email: 'me@test.com',
    playlist_id: 1,
    version_id: 10,
    content: 'body',
    subject: 'sub',
    to: '',
    cc: '',
    links: [],
    version_status: '',
    published: false,
    edited: false,
    published_note_id: null,
    updated_at: '2025-01-01T00:00:00Z',
    created_at: '2025-01-01T00:00:00Z',
    attachment_ids: [],
    ...over,
  };
}

const version10: Version = {
  type: 'Version',
  id: 10,
  name: 'tst_010_comp_v1',
  notes: [],
  thumbnail: 'https://example.com/thumb.jpg',
  user: { id: 99, name: 'Cameron Target', type: 'HumanUser' },
};

const version20: Version = {
  type: 'Version',
  id: 20,
  name: 'tst_020_comp_v1',
  notes: [],
  user: { id: 1, name: 'Artist', type: 'HumanUser' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseDraftNote.mockImplementation(() => ({
    draftNote: {
      content: '',
      subject: '',
      to: [],
      cc: [],
      links: [],
      versionStatus: '',
      published: false,
      edited: false,
      publishedNoteId: null,
      attachmentIds: [],
    },
    updateDraftNote: vi.fn(),
    saveAttachmentIds: vi.fn(async () => {}),
    clearDraftNote: vi.fn(),
    flushDebouncedSave: vi.fn(async () => {}),
    isSaving: false,
    isLoading: false,
  }));
});

function renderDialog(props: Partial<ComponentProps<typeof PublishNotesDialog>> = {}) {
  return render(
    <PublishNotesDialog
      open
      onClose={vi.fn()}
      playlistId={100}
      userEmail="me@test.com"
      notes={[]}
      versions={[]}
      {...props}
    />
  );
}

describe('PublishNotesDialog', () => {
  it('renders one editor row per note in the notes list', () => {
    renderDialog({
      notes: [
        draft({ _id: 'b', version_id: 10, published: false }),
        draft({ _id: 'c', version_id: 10, published: true, edited: true }),
      ],
      versions: [version10],
    });

    expect(screen.getAllByTestId('note-editor')).toHaveLength(2);
  });

  it('shows empty state when notes is empty', () => {
    renderDialog({ notes: [] });
    expect(screen.getByText('No notes to publish.')).toBeInTheDocument();
  });

  it('renders all notes passed in without filtering', () => {
    renderDialog({
      notes: [
        draft({
          _id: 'empty',
          version_id: 10,
          published: false,
          content: '   ',
          subject: 'Has subject',
        }),
        draft({ _id: 'withBody', version_id: 10, content: 'Hello' }),
      ],
      versions: [version10],
    });

    expect(screen.getAllByTestId('note-editor')).toHaveLength(2);
  });

  it('renders one card per version and one row per draft', () => {
    renderDialog({
      notes: [
        draft({ _id: 'a', version_id: 10, user_email: 'me@test.com' }),
        draft({ _id: 'b', version_id: 10, user_email: 'other@test.com' }),
        draft({ _id: 'c', version_id: 20, user_email: 'me@test.com' }),
      ],
      versions: [version10, version20],
    });

    expect(screen.getByText('tst_010_comp_v1')).toBeInTheDocument();
    expect(screen.getByText('tst_020_comp_v1')).toBeInTheDocument();
    expect(screen.getAllByTestId('note-editor')).toHaveLength(3);
  });

  it('calls useDraftNote with draft owner email for each row', () => {
    renderDialog({
      notes: [
        draft({ _id: 'a', version_id: 10, user_email: 'me@test.com' }),
        draft({ _id: 'b', version_id: 10, user_email: 'other@test.com' }),
      ],
      versions: [version10],
    });

    const calls = mockedUseDraftNote.mock.calls.map((c) => c[0].userEmail);
    expect(calls).toContain('me@test.com');
    expect(calls).toContain('other@test.com');
  });

  it('updates Publish selected count when a checkbox is unchecked', async () => {
    const user = userEvent.setup();
    renderDialog({
      notes: [
        draft({ _id: 'a', version_id: 10 }),
        draft({ _id: 'b', version_id: 20 }),
      ],
      versions: [version10, version20],
    });

    expect(screen.getByRole('button', { name: /Publish selected \(2\)/i })).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]!);

    expect(screen.getByRole('button', { name: /Publish selected \(1\)/i })).toBeInTheDocument();
  });

  it('batch menu selects only my notes', async () => {
    const user = userEvent.setup();
    renderDialog({
      notes: [
        draft({ _id: 'a', version_id: 10, user_email: 'me@test.com' }),
        draft({ _id: 'b', version_id: 10, user_email: 'other@test.com' }),
      ],
      versions: [version10],
    });

    await user.click(screen.getByRole('button', { name: /Batch note selection/i }));
    await user.click(await screen.findByRole('menuitem', { name: /Select only my notes/i }));

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it('batch menu selects only notes from others', async () => {
    const user = userEvent.setup();
    renderDialog({
      notes: [
        draft({ _id: 'a', version_id: 10, user_email: 'me@test.com' }),
        draft({ _id: 'b', version_id: 10, user_email: 'other@test.com' }),
      ],
      versions: [version10],
    });

    await user.click(screen.getByRole('button', { name: /Batch note selection/i }));
    await user.click(await screen.findByRole('menuitem', { name: /Select only notes from others/i }));

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it('batch menu selects all notes', async () => {
    const user = userEvent.setup();
    renderDialog({
      notes: [
        draft({ _id: 'a', version_id: 10, user_email: 'me@test.com' }),
        draft({ _id: 'b', version_id: 10, user_email: 'other@test.com' }),
      ],
      versions: [version10],
    });

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]!);

    await user.click(screen.getByRole('button', { name: /Batch note selection/i }));
    await user.click(await screen.findByRole('menuitem', { name: /Select all notes/i }));

    expect(screen.getByRole('button', { name: /Publish selected \(2\)/i })).toBeInTheDocument();
  });

  it('sends targets for only checked rows on publish', async () => {
    const user = userEvent.setup();
    renderDialog({
      notes: [
        draft({ _id: 'a', version_id: 10, user_email: 'me@test.com' }),
        draft({ _id: 'b', version_id: 10, user_email: 'other@test.com' }),
      ],
      versions: [version10],
    });

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]!);

    await user.click(screen.getByRole('button', { name: /Publish selected/i }));

    expect(mockPublishNotes).toHaveBeenCalledWith(
      {
        playlistId: 100,
        request: {
          user_email: 'me@test.com',
          targets: [{ user_email: 'other@test.com', version_id: 10 }],
        },
      }
    );
  });

  it('calls flushDebouncedSave from each row before publish', async () => {
    const user = userEvent.setup();
    const flushA = vi.fn(async () => {});
    const flushB = vi.fn(async () => {});
    let call = 0;
    mockedUseDraftNote.mockImplementation(() => {
      const flush = call++ === 0 ? flushA : flushB;
      return {
        draftNote: {
          content: '',
          subject: '',
          to: [],
          cc: [],
          links: [],
          versionStatus: '',
          published: false,
          edited: false,
          publishedNoteId: null,
          attachmentIds: [],
        },
        updateDraftNote: vi.fn(),
        saveAttachmentIds: vi.fn(async () => {}),
        clearDraftNote: vi.fn(),
        flushDebouncedSave: flush,
        isSaving: false,
        isLoading: false,
      };
    });

    renderDialog({
      notes: [
        draft({ _id: 'a', version_id: 10 }),
        draft({ _id: 'b', version_id: 20 }),
      ],
      versions: [version10, version20],
    });

    await user.click(screen.getByRole('button', { name: /Publish selected/i }));

    expect(flushA).toHaveBeenCalled();
    expect(flushB).toHaveBeenCalled();
  });
});
