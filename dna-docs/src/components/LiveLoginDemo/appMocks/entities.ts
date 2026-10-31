import {
  filterMentionCandidates,
  filterSearchResultsByEntityTypes,
} from '../../../../../frontend/packages/core/src/mentionLookup';

// Sample entities for the notes demo: who you can @mention and link. Users
// are VFX pioneers; shots, assets and versions match the playlist in
// LiveUiDemo/data.ts.

export interface DemoEntity {
  type: string;
  id: string;
  name: string;
  email?: string;
}

export const DEMO_PROJECT_ID = '101';

export const DEMO_SUBMITTER: DemoEntity = {
  type: 'User',
  id: 'john.dykstra',
  name: 'John Dykstra',
  email: 'john.dykstra@example.com',
};

/** The version whose notes the demo edits, in the app's Version shape. */
export const DEMO_VERSION = {
  type: 'Version' as const,
  id: 'v-1020-060',
  name: 'TST_010_0020_anim_v060',
  user: {type: 'User' as const, id: DEMO_SUBMITTER.id, name: DEMO_SUBMITTER.name},
  notes: [],
};

const user = (id: string, name: string): DemoEntity => ({
  type: 'User',
  id,
  name,
  email: `${id}@example.com`,
});
const shot = (code: string): DemoEntity => ({type: 'Shot', id: `s-${code}`, name: code});
const asset = (code: string): DemoEntity => ({type: 'Asset', id: `a-${code}`, name: code});
const version = (code: string): DemoEntity => ({type: 'Version', id: `v-${code}`, name: code});
const task = (name: string): DemoEntity => ({type: 'Task', id: `t-${name.toLowerCase()}`, name});

export const DEMO_ENTITIES: DemoEntity[] = [
  DEMO_SUBMITTER,
  user('dennis.muren', 'Dennis Muren'),
  user('phil.tippett', 'Phil Tippett'),
  user('douglas.trumbull', 'Douglas Trumbull'),
  user('ray.harryhausen', 'Ray Harryhausen'),
  user('john.knoll', 'John Knoll'),
  user('richard.edlund', 'Richard Edlund'),
  user('ken.ralston', 'Ken Ralston'),
  user('rob.legato', 'Rob Legato'),
  user('joe.letteri', 'Joe Letteri'),
  user('stan.winston', 'Stan Winston'),
  user('ed.catmull', 'Ed Catmull'),
  shot('TST_010_0010'),
  shot('TST_010_0020'),
  shot('TST_010_0030'),
  shot('TST_010_0040'),
  shot('TST_020_0010'),
  shot('TST_020_0020'),
  shot('TST_020_0030'),
  asset('spaceship_rigged_001'),
  asset('harvester'),
  asset('ornithopter'),
  asset('carryall'),
  asset('throne_room'),
  version('TST_010_0010_comp_v001'),
  version('TST_010_0020_anim_v060'),
  version('TST_010_0030_comp_v020'),
  version('TST_010_0040_comp_v005'),
  version('TST_020_0010_anim_v024'),
  version('TST_020_0020_comp_v003'),
  task('Animation'),
  task('Comp'),
  task('Lighting'),
  task('FX'),
];

/** The app's own mention matching (prefix matches first) over the sample set. */
export function searchDemoEntities(
  query: string,
  entityTypes: string[],
  limit = 10,
): DemoEntity[] {
  const pool = filterSearchResultsByEntityTypes(
    DEMO_ENTITIES,
    entityTypes as Parameters<typeof filterSearchResultsByEntityTypes>[1],
  );
  return filterMentionCandidates(pool, query, limit);
}
