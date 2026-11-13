import {
  addPlaylistId,
  preferredPlaylistVersion,
  removePlaylistId,
  sessionInReviewForPlaylist,
} from './sessions';

describe('addPlaylistId', () => {
  it('appends a playlist id to an empty list', () => {
    expect(addPlaylistId(undefined, '45')).toEqual(['45']);
    expect(addPlaylistId(null, '45')).toEqual(['45']);
    expect(addPlaylistId([], '45')).toEqual(['45']);
  });

  it('keeps an id that is already linked', () => {
    expect(addPlaylistId(['45', '46'], '45')).toEqual(['45', '46']);
  });

  it('does not mutate the original list', () => {
    const original = ['45'];
    addPlaylistId(original, '46');
    expect(original).toEqual(['45']);
  });
});

describe('removePlaylistId', () => {
  it('drops the playlist id and keeps the others', () => {
    expect(removePlaylistId(['45', '46'], '45')).toEqual(['46']);
  });

  it('returns an empty list when the id is missing', () => {
    expect(removePlaylistId(undefined, '45')).toEqual([]);
    expect(removePlaylistId(['46'], '45')).toEqual(['46']);
  });

  it('does not mutate the original list', () => {
    const original = ['45', '46'];
    removePlaylistId(original, '45');
    expect(original).toEqual(['45', '46']);
  });
});

describe('sessionInReviewForPlaylist', () => {
  const session = {
    in_review_playlist_id: '46',
    in_review_version_id: '200',
    in_review_pinned: true,
  };

  it('returns the session in-review when it targets the playlist', () => {
    expect(sessionInReviewForPlaylist(session, '46')).toEqual({
      versionId: '200',
      pinned: true,
    });
  });

  it('returns null when the session targets a different playlist', () => {
    expect(sessionInReviewForPlaylist(session, '45')).toEqual({
      versionId: null,
      pinned: false,
    });
  });

  it('returns null when session or playlist is missing', () => {
    expect(sessionInReviewForPlaylist(null, '46')).toEqual({
      versionId: null,
      pinned: false,
    });
    expect(sessionInReviewForPlaylist(session, null)).toEqual({
      versionId: null,
      pinned: false,
    });
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
