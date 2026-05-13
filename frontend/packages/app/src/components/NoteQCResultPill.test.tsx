import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../test/render';
import { NoteQCResultPill } from './NoteQCResultPill';
import type { NoteQCResult } from '@dna/core';
import type { LocalDraftNote } from '../hooks/useDraftNote';

const emptyLocalDraft: LocalDraftNote = {
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
};

describe('NoteQCResultPill', () => {
  it('renders nothing when not loading and results empty', () => {
    render(
      <NoteQCResultPill
        draftKey="d1"
        results={[]}
        loading={false}
        ignored={new Set()}
        onToggleIgnore={vi.fn()}
        onFix={vi.fn()}
        localDraft={emptyLocalDraft}
        onFixAll={vi.fn()}
      />
    );
    expect(screen.queryByLabelText(/Note QC status/i)).not.toBeInTheDocument();
  });

  it('shows running label when loading', () => {
    render(
      <NoteQCResultPill
        draftKey="d1"
        results={[]}
        loading
        ignored={new Set()}
        onToggleIgnore={vi.fn()}
        onFix={vi.fn()}
        localDraft={emptyLocalDraft}
        onFixAll={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/Note QC status/i)).toHaveTextContent(/Running/);
  });

  it('shows pass label when all checks pass', () => {
    const results: NoteQCResult[] = [
      {
        check_id: 'c1',
        check_name: 'A',
        severity: 'warning',
        passed: true,
      },
    ];
    render(
      <NoteQCResultPill
        draftKey="d1"
        results={results}
        loading={false}
        ignored={new Set()}
        onToggleIgnore={vi.fn()}
        onFix={vi.fn()}
        localDraft={emptyLocalDraft}
        onFixAll={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/Note QC status/i)).toHaveTextContent(/All checks pass/);
  });
});
