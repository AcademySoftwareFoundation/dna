// Sample playlist for the UI demo. Thumbnails live in static/img/demo; the
// notes are the reference notes from evals/20260620/dataset/notes.

export interface DemoVersion {
  shot: string;
  version: string;
  /** File name under static/img/demo. */
  thumb: string;
  notes: string[];
}

export const ARTIST = 'John Dykstra';
export const DATE_SUBMITTED = 'Jan 25, 2026';

export const VERSIONS: DemoVersion[] = [
  {
    shot: 'TST_010_0020',
    version: 'anim_v060',
    thumb: 'TST_010_0020.png',
    notes: [
      'Visibility of surroundings is good. Want to read items in room, but not see where room ends.',
      'Digi-doubles are looking static. Need movement. Have them walk into their current position.',
      'Lose highlights on top of throne, should look like alien material, not reflective.',
    ],
  },
  {
    shot: 'TST_010_0030',
    version: 'comp_v020',
    thumb: 'TST_010_0030.png',
    notes: [
      'Remove middle tree in foreground.',
      'Want to read prisoners.',
      'Lessen smoke obscuring prisoners, limit bloom of fire glow.',
      'Background trees are fine.',
      'Guard with helmet SL at the end is looking good.',
    ],
  },
  {
    shot: 'TST_010_0040',
    version: 'comp_v005',
    thumb: 'TST_010_0040.png',
    notes: [
      'Harvester shadow is looking good.',
      'Want to add a rack focus to the Ornothopter as it passes in front of Harvester.',
      'Movement of Ornothopter blades is looking good. Trajectory good too.',
      'Rack focus should be quick, 10 frames max.',
    ],
  },
  {
    shot: 'TST_020_0010',
    version: 'anim_v024',
    thumb: 'TST_020_0010.png',
    notes: ['Final pending tech check.'],
  },
  {
    shot: 'TST_020_0020',
    version: 'comp_v003',
    thumb: 'TST_020_0020.png',
    notes: [
      'Add contrast to desert, want to read dunes better. Seems one dimensional.',
      'Dial back haze, overall needs more contrast, less apocalyptic, more beautiful sunset.',
    ],
  },
  {
    shot: 'TST_010_0010',
    version: 'comp_v001',
    thumb: 'TST_010_0010.png',
    notes: [
      'Shot looks blown out.',
      'Bring down brightness of sky, add more detail.',
      "Lose the lens flare, it's distracting.",
      'Mountains and scenery are looking good.',
      "Desert area on SR needs more sand and dust being kicked up by the wind. Need to show wind that's pushing the Carryall.",
    ],
  },
];
