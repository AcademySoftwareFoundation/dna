# ADR 0001: ShotGrid schema for published video segments

- Status: Accepted (V1 / proof of concept)
- Date: 2026-06-09
- Context: movie-file-segmenting feature, Slice 3 (provider methods)

## Context

After a review meeting, DNA cuts the Zoom recording into per-Version clips and
publishes them to the production tracking system. The handoff left open *how*
those clips are represented in ShotGrid and *which field* links them to the
custom entity used by the transcript publishing workflow (open design question
1). The provider methods can't be implemented without pinning this down.

## Decision

Each published recording produces, **per version**, one row in a dedicated
custom-entity slot plus one ShotGrid **Version** entity per clip:

1. **Video-segment row** — created in the custom-entity slot
   `SHOTGRID_VIDEO_SEGMENT_ENTITY` (default `CustomEntity14` — the slot this
   deployment already uses for the transcript workflow, so clips land alongside
   their transcripts). Its fields mirror
   the transcript row so the two workflows stay parallel:
   `code`, `project`, `sg_playlist`, `sg_version_in_review`, `sg_meeting_id`,
   `sg_meeting_date`, `sg_platform`.
2. **Clip Versions** — one ShotGrid `Version` per clip. The rendered MP4 is
   uploaded to the Version's movie field via the SDK's `upload()` (mirroring how
   note image attachments are uploaded — binary through the SDK, not a separate
   HTTP call).
3. **Link** — the clip Versions are linked back onto the row through a
   multi-entity field on the row.

The bookkeeping row (`published_video_segments`, Slice 4) stores the
video-segment row's `entity_type` + `entity_id`. `update_video_segments` pins
`entity_type` to that stored value, never re-reading the env, so updates against
rows created before a slot migration still resolve.

### Configurable field names

Because exact field IDs are site-specific and the real ShotGrid schema was not
available during the PoC, the names are env-configurable with defaults:

| Env var                          | Default             | Purpose                                            |
| -------------------------------- | ------------------- | -------------------------------------------------- |
| `SHOTGRID_VIDEO_SEGMENT_ENTITY`  | `CustomEntity14`    | Custom-entity slot holding the per-version row     |
| `SHOTGRID_CLIP_MOVIE_FIELD`      | `sg_uploaded_movie` | Version field the clip MP4 is uploaded to          |
| `SHOTGRID_CLIP_LINK_FIELD`       | `sg_clips`          | Multi-entity field on the row linking clip Versions |

## Consequences

- Clips are first-class, playable ShotGrid Versions — reviewers can open a clip
  directly from the linked entity.
- Re-publish after a transcript change re-renders and **appends** new clip
  Versions; V1 does **not** prune previously-linked Versions (documented
  limitation, a follow-up).
- Sites that use different field IDs set the three env vars; no code change.
- The defaults (`CustomEntity14`, `sg_uploaded_movie`, `sg_clips`) must be
  validated against the real ShotGrid site before turning the feature on in a
  production deployment — see DEPLOYMENT.md.

## Alternatives considered

- **Upload clips as attachments on the transcript row** (no Version entities) —
  simpler, but clips wouldn't be playable Versions and couldn't carry their own
  status/notes. Rejected.
- **One row per clip** — explodes row count and breaks the
  (playlist, version, meeting, recording) bookkeeping key. Rejected.
