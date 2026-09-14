import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '../test/render';
import { NoteQCTab } from './NoteQCTab';
import { apiHandler } from '../api';

describe('NoteQCTab', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(apiHandler, 'getQCChecks').mockResolvedValue([
      {
        _id: 'abc',
        user_email: 'u@test.com',
        name: 'Check one',
        prompt: 'Do thing',
        severity: 'warning',
        enabled: true,
        updated_at: '2025-01-01T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
      },
    ]);
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('lists checks from API', async () => {
    render(<NoteQCTab userEmail="u@test.com" />);
    expect(await screen.findByText('Check one')).toBeInTheDocument();
  });
});
