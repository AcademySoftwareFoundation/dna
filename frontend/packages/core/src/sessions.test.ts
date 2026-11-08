import {
  addSessionId,
  findInReviewHolder,
  findInReviewHolders,
  preferredPlaylistVersion,
  removeSessionId,
} from './sessions';

describe('addSessionId', () => {
  it('appends a session id to an empty list', () => {
    expect(addSessionId(undefined, 'sess-1')).toEqual(['sess-1']);
    expect(addSessionId(null, 'sess-1')).toEqual(['sess-1']);
    expect(addSessionId([], 'sess-1')).toEqual(['sess-1']);
  });

  it('keeps an id that is already linked', () => {
    expect(addSessionId(['sess-1', 'sess-2'], 'sess-1')).toEqual([
      'sess-1',
      'sess-2',
    ]);
  });

  it('does not mutate the original list', () => {
    const original = ['sess-1'];
    addSessionId(original, 'sess-2');
    expect(original).toEqual(['sess-1']);
  });
});

describe('removeSessionId', () => {
  it('drops the session id and keeps the others', () => {
    expect(removeSessionId(['sess-1', 'sess-2'], 'sess-1')).toEqual(['sess-2']);
  });

  it('returns an empty list when the id is missing', () => {
    expect(removeSessionId(undefined, 'sess-1')).toEqual([]);
    expect(removeSessionId(['sess-2'], 'sess-1')).toEqual(['sess-2']);
  });

  it('does not mutate the original list', () => {
    const original = ['sess-1', 'sess-2'];
    removeSessionId(original, 'sess-1');
    expect(original).toEqual(['sess-1', 'sess-2']);
  });
});

describe('findInReviewHolder', () => {
  const playlists = [
    { playlist_id: '45', in_review: null, in_review_pinned: false },
    { playlist_id: '46', in_review: '200', in_review_pinned: true },
    { playlist_id: '47', in_review: '300', in_review_pinned: false },
  ];

  it('returns the other playlist that holds in-review', () => {
    expect(findInReviewHolder(playlists, '45')).toEqual({
      playlist_id: '46',
      in_review: '200',
      in_review_pinned: true,
    });
  });

  it('skips the excluded playlist even when it is in review', () => {
    expect(findInReviewHolder(playlists, '46')).toEqual({
      playlist_id: '47',
      in_review: '300',
      in_review_pinned: false,
    });
  });

  it('returns null when nobody else is in review', () => {
    expect(
      findInReviewHolder(
        [{ playlist_id: '45', in_review: '200', in_review_pinned: false }],
        '45'
      )
    ).toBeNull();
  });
});

describe('findInReviewHolders', () => {
  const playlists = [
    { playlist_id: '45', in_review: null, in_review_pinned: false },
    { playlist_id: '46', in_review: '200', in_review_pinned: true },
    { playlist_id: '47', in_review: '300', in_review_pinned: false },
  ];

  it('returns every other playlist that holds in-review', () => {
    expect(findInReviewHolders(playlists, '45')).toEqual([
      {
        playlist_id: '46',
        in_review: '200',
        in_review_pinned: true,
      },
      {
        playlist_id: '47',
        in_review: '300',
        in_review_pinned: false,
      },
    ]);
  });

  it('returns an empty list when nobody else is in review', () => {
    expect(
      findInReviewHolders(
        [{ playlist_id: '45', in_review: '200', in_review_pinned: false }],
        '45'
      )
    ).toEqual([]);
  });
});

describe('preferredPlaylistVersion', () => {
  const versions = [{ id: '100' }, { id: '200' }];

  it('returns null when the playlist has no versions', () => {
    expect(preferredPlaylistVersion([], '200')).toBeNull();
  });

  it('opens the in-review version when it is in the playlist', () => {
    expect(preferredPlaylistVersion(versions, '200')).toEqual({ id: '200' });
  });

  it('opens the first version when nothing is in review', () => {
    expect(preferredPlaylistVersion(versions, null)).toEqual({ id: '100' });
    expect(preferredPlaylistVersion(versions, 'missing')).toEqual({
      id: '100',
    });
  });
});
