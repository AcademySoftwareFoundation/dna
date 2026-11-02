// Sample playlists for the Griffin project (the demos' project), named
// TST_REVIEW_<YYYYMMDD>_001 for today and the two days before. The versions
// in each are entries from ./entities.

export interface DemoPlaylist {
  id: string;
  code: string;
  /** Version names (see DEMO_ENTITIES), newest playlist first. */
  versions: string[];
}

function reviewCode(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const yyyymmdd =
    `${date.getFullYear()}` +
    `${date.getMonth() + 1}`.padStart(2, '0') +
    `${date.getDate()}`.padStart(2, '0');
  return `TST_REVIEW_${yyyymmdd}_001`;
}

export const DEMO_PLAYLISTS: DemoPlaylist[] = [
  {
    id: '1011',
    code: reviewCode(0),
    versions: [
      'TST_010_0020_anim_v060',
      'TST_010_0030_comp_v020',
      'TST_010_0040_comp_v005',
      'TST_020_0010_anim_v024',
      'TST_020_0020_comp_v003',
      'TST_010_0010_comp_v001',
    ],
  },
  {
    id: '1012',
    code: reviewCode(1),
    versions: ['TST_010_0020_anim_v059', 'TST_010_0030_comp_v019', 'TST_020_0020_comp_v002'],
  },
  {
    id: '1013',
    code: reviewCode(2),
    versions: ['TST_010_0040_comp_v004', 'TST_020_0010_anim_v023', 'TST_020_0030_comp_v001'],
  },
];

/** Today's review: what the demos open on. */
export const DEMO_PLAYLIST_ID = DEMO_PLAYLISTS[0].id;

/** Shots with a frame in static/img/demo. */
const THUMBNAILED_SHOTS = new Set([
  'TST_010_0010',
  'TST_010_0020',
  'TST_010_0030',
  'TST_010_0040',
  'TST_020_0010',
  'TST_020_0020',
]);

/** Path under static/ of a version's thumbnail, if its shot has one. */
export function thumbnailFor(versionName: string): string | undefined {
  const shot = versionName.match(/^TST_\d{3}_\d{4}/)?.[0];
  return shot && THUMBNAILED_SHOTS.has(shot) ? `img/demo/${shot}.png` : undefined;
}
