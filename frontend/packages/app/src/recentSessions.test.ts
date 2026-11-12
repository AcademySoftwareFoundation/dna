import { afterEach, describe, expect, it } from 'vitest';
import {
  RECENT_SESSIONS_KEY,
  readRecentSessions,
  rememberRecentSession,
} from './recentSessions';

describe('recentSessions', () => {
  afterEach(() => {
    localStorage.removeItem(RECENT_SESSIONS_KEY);
  });

  it('returns an empty list when nothing is stored', () => {
    expect(readRecentSessions()).toEqual([]);
  });

  it('remembers a session at the front and dedupes by id', () => {
    rememberRecentSession({
      id: 'a',
      name: 'Alpha',
      projectId: '1',
      projectName: 'Proj',
    });
    rememberRecentSession({
      id: 'b',
      name: 'Beta',
      projectId: '1',
    });
    rememberRecentSession({
      id: 'a',
      name: 'Alpha Renamed',
      projectId: '1',
      projectName: 'Proj',
    });

    expect(readRecentSessions()).toEqual([
      {
        id: 'a',
        name: 'Alpha Renamed',
        projectId: '1',
        projectName: 'Proj',
      },
      { id: 'b', name: 'Beta', projectId: '1', projectName: undefined },
    ]);
  });

  it('keeps only the five most recent sessions', () => {
    for (let i = 1; i <= 6; i += 1) {
      rememberRecentSession({
        id: `s${i}`,
        name: `Session ${i}`,
        projectId: '1',
      });
    }

    expect(readRecentSessions().map((item) => item.id)).toEqual([
      's6',
      's5',
      's4',
      's3',
      's2',
    ]);
  });
});
