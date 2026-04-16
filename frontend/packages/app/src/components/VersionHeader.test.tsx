import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '../test/render';
import { HotkeysProvider } from '../hotkeys';
import { VersionHeader } from './VersionHeader';
import { apiHandler } from '../api';

beforeEach(() => {
  vi.spyOn(apiHandler, 'getVersionStatuses').mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VersionHeader', () => {
  it('renders PT tab button when onSyncProdtrackTab is provided', () => {
    const onSync = vi.fn();
    render(
      <HotkeysProvider>
        <VersionHeader
          shotCode="SHOT"
          versionNumber="v001"
          projectId={1}
          onSyncProdtrackTab={onSync}
          syncProdtrackDisabled={false}
        />
      </HotkeysProvider>
    );
    expect(screen.getByRole('button', { name: /PT tab/i })).toBeInTheDocument();
  });
});
