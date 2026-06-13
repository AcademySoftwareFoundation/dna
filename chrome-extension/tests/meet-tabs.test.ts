import { describe, expect, it, vi } from 'vitest';
import { listMeetTabsInWindow } from '../src/session/meet-tabs';

describe('listMeetTabsInWindow', () => {
  it('returns parsed meet tabs in a window', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [
          {
            id: 1,
            title: 'Standup',
            url: 'https://meet.google.com/abc-defg-hij',
          },
          { id: 2, title: 'Other', url: 'https://example.com' },
        ]),
      },
    });

    const tabs = await listMeetTabsInWindow(99);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].meetingId).toBe('abc-defg-hij');
    expect(tabs[0].tabId).toBe(1);
  });
});
