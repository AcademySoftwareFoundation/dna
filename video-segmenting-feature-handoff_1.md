# DNA: Movie File Segmenting Feature

## TL;DR

After a review meeting ends, the user uploads the Zoom recording, and DNA cuts that single MP4 into per-Version clips by **replaying segmentation decisions that were already made live during the meeting** via Vexa pause/resume and the in-review toggle. No new ASR pass. No new segmentation logic. The transcript already encodes the cuts; the video is being indexed by it.

---

## Context

DNA is the Dallies Note Assistant (`AcademySoftwareFoundation/dna`). During a review session, a Vexa bot joins the meeting and streams transcript segments in real time over WebSocket. The frontend has a `TranscriptManager` and an in-review toggle on each Version in the playlist. Two user actions during the meeting determine what transcript ends up where:

1. **In-review toggle.** When the user toggles a Version into "in-review," incoming Vexa segments get attached to that Version. Toggling Version A off and Version B on switches the attachment target.
2. **Vexa pause/resume.** When paused, no segments are produced. Time passes in the meeting, but nothing is captured. This creates gaps.

The result is that each Version already has a list of transcript segments stored in Mongo, and each segment has wall-clock timestamps. Those timestamps describe — implicitly — which spans of the meeting belonged to which Version.

There is currently no link between the published transcript and the video moment it describes. A reviewer can read the transcript but can't connect it to that point in the meeting recording. This feature closes that gap.

---

## The core insight

Segmentation does not need to be invented. It already happened, live, encoded in the timestamps on the stored segments. The video segmenter is a **pure replay** of decisions already made.

A Version with three separate review spans gets three video cuts. A Version that was never toggled in-review gets no cuts. A span where Vexa was paused gets no cuts (no segments → no run to translate).

This is the load-bearing idea. If anything in the design starts to feel like it's making segmentation decisions, step back — it shouldn't be.

---

## User-facing flow

1. Meeting ends. Several Versions on the playlist have transcripts attached (the existing state today).
2. User opens the publish dialog. When the feature flag is on, an **"Add Recording ↑" button** appears on the right side of the dialog header, inline with the "Publish" title.
3. Clicking "Add Recording" opens a **drag-and-drop upload panel** (styled to match the existing dialog UI) with a drop zone and a "Browse" button. User locates and adds the Zoom MP4.
4. DNA asks the user **where to store the rendered clips** — a folder/location picker. User selects a destination. (See open design question 5 for how this works in hosted vs. local deployments.)
5. A **progress bar** is shown while DNA processes the file: matching transcript segment timestamps to recording time, running ffmpeg to cut the clips, and extracting a first-frame thumbnail per clip.
6. When processing completes, the publish dialog body updates: each `VersionPublishCard` now shows a **Recording row** alongside the existing Note and Transcript rows. The Recording row has a checkbox and a thumbnail of the first frame (same 72×72 `ThumbnailBox` style used for image attachments in the note editor).
7. User reviews the selection, checks or unchecks items, and clicks **"Publish selected"**. Checked recordings are uploaded to ShotGrid as Versions linked to the custom entity used by the transcript publishing workflow.

There are two human-in-the-loop decisions: choosing the output folder (step 4) and reviewing the publish selection (step 7). All segmentation is mechanical replay of live transcript data.

---

## How it works under the hood

### Step 1: Establish recording-to-wallclock alignment

Transcript segments have wall-clock timestamps (UTC). The uploaded MP4 has its own internal clock starting at `00:00:00`. To cut the video, you need exactly one number:

```
recording_t0_wallclock = the UTC instant at which the recording's 00:00:00 happened
```

Default sources, in order of preference:

1. Zoom recording metadata (`recording_start` from Zoom Cloud API, or parsed from the default Zoom filename convention).
2. The bot's join time, already stored in DNA's meeting record.
3. Manual user adjustment, with the first transcript line shown next to the first ~30s of audio as a visual aid.

Edge case to document but not handle in V1: Zoom recordings can be paused mid-recording by the host, which creates discontinuities in the MP4 that don't exist in the wall clock.

### Step 2: Compute the cut list per Version

A **pure function**. Signature roughly:

```python
def build_video_cuts_payload(
    segments_by_version: dict[VersionId, list[StoredSegment]],
    recording_t0: datetime,
) -> list[VersionCutList]:
    ...
```

Where each `VersionCutList` is:

```python
{
    "version_id": ...,
    "cuts": [
        {
            "video_in_seconds": float,
            "video_out_seconds": float,
            "transcript_segment_ids": [...],
        },
        ...
    ],
}
```

Algorithm per Version:

1. Sort the Version's segments by `start_wallclock`.
2. Group into runs: a new run starts whenever there is a gap between consecutive segments larger than `SEGMENT_RUN_GAP_SECONDS` (env-configurable, default e.g. 2.0). A gap means either Vexa was paused or a different Version was in-review during that interval — either way, it's a cut boundary.
3. For each run, emit:
   - `video_in_seconds = run.first_segment.start_wallclock - recording_t0` (as seconds)
   - `video_out_seconds = run.last_segment.end_wallclock - recording_t0`
   - The list of constituent segment IDs (so SG rows can link back to specific transcript lines later).
4. Drop cuts that fall entirely outside `[0, recording_duration]`. Clamp cuts that partially overlap.

This function should produce a **stable body hash** over its output for idempotence: if a republish produces the same hash, skip the provider call and return `skipped`.

### Step 3: Materialize the cuts

**V1: rendered clips via ffmpeg, stored using the image-attachment pattern.**

Match the existing image attachment storage exactly:
- Clips are stored at `{ATTACHMENT_STORE_DIR}/{clip_uuid}/{filename}.mp4` (same configurable env var used by image attachments, defaulting to `/tmp/dna_attachments`).
- A first-frame thumbnail is extracted per clip via ffmpeg and stored alongside the clip at `{ATTACHMENT_STORE_DIR}/{clip_uuid}/thumb.jpg`.
- Both are served via the existing `GET /api/attachments/{id}` endpoint (or a parallel `/api/clips/{id}` endpoint if content-type routing is needed — check before adding a new route).
- The clip UUID is stored in the `published_video_segments` Mongo collection and referenced in the publish payload, the same way `attachment_ids` are referenced on `DraftNote`.

ffmpeg runs synchronously during the upload/processing step — no async worker in V1. For typical Zoom recordings (1–2 hour meetings, clips of a few minutes each) the cuts are fast enough to block the request. If profiling later shows this is too slow, move to a background task in V2.

**V2 (separate, later):** async worker with job tracking, progress polling, retry semantics, and optionally cloud rendering. **Keep this out of V1.**

### Step 4: Publish to ShotGrid

- New Mongo collection `published_video_segments`, keyed by `(playlist_id, version_id, meeting_id, recording_id)`, storing `sg_entity_id`, `sg_entity_type`, and the cut-list `body_hash`.
- New methods on `ProdtrackProviderBase`: `publish_video_segments(...)` and `update_video_segments(...)`. ShotGrid implementation uploads each rendered clip file using `sg.upload()` as a ShotGrid **Version** entity, linked to the same custom entity used by the transcript publishing workflow (env var: `SHOTGRID_VIDEO_SEGMENT_ENTITY=CustomEntityNN`). This mirrors how image attachments are uploaded on note publish — the binary is sent via the ShotGrid Python SDK, not via a separate HTTP upload.
- Mock provider raises `NotImplementedError` with a user-facing message.
- New REST endpoint, flag-gated. Returns `created` / `updated` / `skipped` based on body-hash comparison against the bookkeeping row.
- `update_video_segments` must take `entity_type` as a required kwarg sourced from the **bookkeeping row**, not from current env. This matters because if a studio migrates ShotGrid custom-entity slots later, updates against rows created on the old slot still need to work. Pin entity_type to bookkeeping; don't re-read env on update.

### Feature flags

- Backend: `DNA_ENABLE_VIDEO_SEGMENT_PUBLISH=true` to enable the endpoint. Default off → 404.
- Frontend build: `VITE_ENABLE_VIDEO_SEGMENT_PUBLISH=true` to render the UI. Default off → button hidden.
- SG slot env: `SHOTGRID_VIDEO_SEGMENT_ENTITY=CustomEntityNN` for the target custom entity slot.

---

## What this feature is NOT

These keep V1 small and reviewable.

- **Not** running ASR on the uploaded video. The transcript is already authoritative.
- **Not** letting the user manually edit cut boundaries. Boundaries come from live toggle/pause behavior. Manual editing is a follow-up feature.
- **Not** detecting speakers, scenes, or content from the video. The video is dumb media being indexed by the transcript's existing structure.
- **Not** making any segmentation decisions during upload. All segmentation happened live; upload is replay.
- **Not** using virtual cuts or object storage. Clips are rendered locally via ffmpeg and stored using the same attachment store pattern as images.
- **Not** trying to handle mid-recording Zoom pauses. Document as a known limitation.

---

## The load-bearing invariant

The entire feature rests on this:

> Transcript segments carry wall-clock timestamps that can be subtracted from a known `recording_t0` to produce valid video offsets, and Vexa pause/resume + Version toggle events are faithfully reflected as gaps/grouping in the stored segments.

**Before writing any code**, verify this against the actual `StoredSegment` shape in the repo. Specifically:

- Do segments have explicit `start_ts` / `end_ts` wall-clock fields, or only relative offsets from a `meeting_start_ts`? The wall-clock fields almost certainly exist (the transcript-side code reads timestamps off them) but confirm the exact name and units before designing the helper signature.
- Does a Vexa pause produce a clean gap in stored segments, or is the pause itself a recorded event? Both are workable, but the cut-list algorithm differs slightly (gap-detection vs. event-driven boundary).
- Is the Version-toggle history persisted as an event log, or only inferred from "which segments ended up on which Version"? If only inferred, the cut-list reconstructs toggle boundaries from segment attachment — workable, but worth confirming.

If any of these are not true as assumed, design adjustments are needed before implementation. **Do not skip this step.**

---

## Open design questions

These should be resolved before locking down the implementation:

1. **SG schema for video references.** Clips are published as ShotGrid **Version** entities linked to the custom entity used by the transcript publishing workflow. Confirm the exact field on that custom entity that the Version link should target before implementing the ShotGrid provider method. Document the decision in an ADR.

2. **Recording upload mechanics.** **Resolved: direct multipart POST, matching the image attachment pattern.** The MP4 is uploaded to `POST /api/recordings/upload` (multipart, flag-gated). Backend stores it at `{ATTACHMENT_STORE_DIR}/{recording_uuid}/source.mp4`, then immediately runs the cut-list builder and ffmpeg synchronously, storing each clip at `{ATTACHMENT_STORE_DIR}/{clip_uuid}/{filename}.mp4` and a first-frame thumbnail at `{ATTACHMENT_STORE_DIR}/{clip_uuid}/thumb.jpg`. The recording UUID and clip UUIDs are returned to the frontend. Note: for very large MP4s (>1 GB) a body-size limit on the server or reverse proxy may need to be raised — document in the deployment checklist.

3. **Zoom Cloud integration.** In scope for V1, or drag-an-MP4-only? Cloud integration is non-trivial (OAuth, polling for ready recordings). Recommend deferring.

4. **The cut-list gap threshold.** `SEGMENT_RUN_GAP_SECONDS = 2.0` is a guess. Should be env-configurable, and the default should be validated against real meeting data once available.

5. **Folder picker in hosted deployments.** The UX flow shows the user choosing where to store the rendered clips. In a local DNA deployment the backend can write to any server-side path the user specifies. In a hosted deployment the backend stores clips in its own `ATTACHMENT_STORE_DIR` and the "folder" concept maps to a logical project/meeting directory within that store — not a path on the user's machine. Decide before Slice 6 whether: (a) the folder picker is only surfaced in local deployments, (b) it always maps to a server-side subdirectory label, or (c) after processing the user is offered a browser download of the clips.

---

## How to slice the work

Build it in red-first slices. Failing tests, then implementation. Each slice is a logical unit of work.

**Slice 1 — Pure cut-list builder.** `build_video_cuts_payload` helper with full test coverage. Empty input, single-Version single-cut, single-Version multi-cut, multi-Version, pause-creates-gap, toggle-creates-gap, cut-out-of-recording-bounds, partial-overlap-clamping, body-hash stability, sort stability. 100% coverage on the helper.

**Slice 2 — Recording upload and clip rendering.** Flag-gated `POST /api/recordings/upload` endpoint (multipart). Stores source MP4 at `{ATTACHMENT_STORE_DIR}/{recording_uuid}/source.mp4`. Runs the cut-list builder (Slice 1) synchronously, then runs ffmpeg to render each clip and extract its first-frame thumbnail, storing both at `{ATTACHMENT_STORE_DIR}/{clip_uuid}/`. Returns `{ recording_id, clips: [{ clip_id, version_id, thumb_id, duration_seconds }] }`. New `meeting_recordings` Mongo collection + `MeetingRecording` model. Alignment helper that computes `recording_t0` from Zoom filename convention or bot join time. Tests: upload stores files, clips are created per version, thumbnail file exists, out-of-bounds cuts are dropped, body-size limit documented in deployment checklist.

**Slice 3 — Provider methods.** `publish_video_segments` / `update_video_segments` on `ProdtrackProviderBase`. ShotGrid implementation. Mock raises with a user-facing message. Tests against the abstract base plus the SG provider (default entity type, env override, create payload shape, update-takes-entity-type-kwarg, disconnect guard, error swallowing).

**Slice 4 — Publish endpoint.** Bookkeeping collection `published_video_segments` + storage methods. New flag-gated REST endpoint wiring the builder, the bookkeeping, and the provider. Tests for: flag-off-returns-404, happy create, skipped-when-body-hash-unchanged, update path, missing-recording, no-cuts, mock-501, bookkeeping-failure-after-SG-create.

**Slice 5 — Frontend types and hook.** Request/response types in core. `ApiHandler.publishVideoSegments`. `usePublishVideoSegments` hook with success and error path tests.

**Slice 6 — UI.** Extend `PublishDialog.tsx` and `PublishNotesDialog.tsx` with the recording upload flow and the new Recording row. The existing dialog shell and core publish logic are largely untouched.

Component structure:
- `PublishDialog.tsx` — add `AddRecordingButton` as the **second child** of the existing header `<Flex align="center" justify="between">`. Render only when `import.meta.env.VITE_ENABLE_VIDEO_SEGMENT_PUBLISH === 'true'`. Pass recording state down to `PublishNotesTabContent` via new optional props.
- `AddRecordingButton.tsx` — button (labelled "Add Recording", upload icon, accent variant). On click, opens `RecordingUploadModal`.
- `RecordingUploadModal.tsx` — modal with a drag-and-drop drop zone and a "Browse" button (`<input type="file" accept=".mp4,video/*">`). After file selection, shows the folder/location picker (see open design question 5). On confirm, calls `useUploadRecording` hook and renders a progress bar while the backend processes. On completion, closes the modal and passes `{ recording_id, clips }` back to `PublishDialog`.
- `VersionPublishCard` in `PublishNotesDialog.tsx` — add a **Recording row** below the existing Transcript row when a clip exists for that version. Row layout matches `TranscriptRow`: `<Checkbox>` + label + clip duration + a `ThumbnailBox` (72×72, same styled component from `NoteEditor.tsx`) showing the first-frame thumbnail fetched via the attachment GET endpoint.

State machine in `PublishDialog`:
- `idle` → "Add Recording" button visible, no Recording rows in cards
- `processing` → modal open, progress bar shown
- `ready` → modal closed, Recording rows appear in each `VersionPublishCard` that has a clip; `PublishNotesTabContent` receives clip IDs
- `publishing` → existing `isPending` covers this

The "Publish selected (N)" button count increments for each checked Recording row, matching how notes and transcripts are counted. The existing `handlePublishSelected` in `PublishNotesTabContent` is extended to fire `publishVideoSegments` in the same `Promise.all` as notes and transcript publishes.

`successSummary` gains a `recordingsPublishedCount` field rendered in the results list alongside the existing image/transcript counts.

Tests: flag-off hides button; flag-on shows button; upload modal opens on click; drag-drop and browse both trigger file selection; progress bar shown during processing; Recording row appears per version after processing; thumbnail rendered from clip thumb; checkbox toggles clip in/out of publish payload; "Publish selected" count includes recordings; happy created path; skipped callout; server-error callout; results summary shows recording count.

**Slice 7 — Docs.** New env-var rows in QUICKSTART. New section in DEPLOYMENT for the ShotGrid site-setup checklist (which CustomEntity to enable, what fields, what permissions). New section in the pipeline doc describing the publish data flow, the Mongo collections touched, and the SG field mapping. ADRs for the design decisions (virtual cuts in V1, recording-t0 derivation, cut-list gap threshold, SG entity choice, pin-entity-type-to-bookkeeping).

---

## Watch-outs

- **Pin entity_type for updates.** When updating a row, route to the entity_type stored on the bookkeeping row, not whatever the env says now. Studios may migrate slots; pre-migration rows must stay updatable.
- **Body-hash idempotence lives on the bookkeeping row, not in SG.** SG is the destination; bookkeeping is the source of truth for "what we last published." This is what makes `skipped` work safely.
- **Surface bookkeeping write failures.** If SG create succeeds and then the bookkeeping upsert fails, the next retry will create a duplicate SG row. The endpoint should return 500 with the SG entity id in the error message so an operator can reconcile, and log at exception level. Don't blind-retry from the client.
- **Watch naive datetimes.** When parsing ISO timestamps, attach UTC if tzinfo is missing. `.astimezone(UTC)` on a naive datetime treats it as local time and can shift meeting dates by a day on non-UTC hosts. Verify under `TZ=America/New_York` or similar.
- **Don't put composite keys in `$set` on upsert.** Use `$setOnInsert` for the immutable composite key fields (`playlist_id`, `version_id`, `meeting_id`, `recording_id`) and `$set` only for mutable fields.
- **Validate inputs before building.** Empty cut list after build (e.g. all segments fell outside the recording) → return 422 with a clear "nothing to publish" message rather than pushing an empty body.

---

## Definition of done for V1

- User can drag or browse to a Zoom MP4 in the publish dialog upload modal, choose an output location, and see a progress bar while clips are rendered.
- DNA computes per-Version cut lists from existing transcript segments without any new ASR, and renders per-clip MP4s via ffmpeg with first-frame thumbnails.
- Each `VersionPublishCard` in the publish dialog shows a Recording row with a thumbnail and checkbox alongside the existing Note and Transcript rows.
- Checked recordings are published to ShotGrid as Version entities linked to the transcript custom entity, alongside notes and transcripts in the same publish action.
- Re-publishing with an unchanged recording returns `skipped`.
- Re-publishing after a Version's transcript changed returns `updated` and re-renders cuts.
- Feature is off by default; turning on both env flags is the only way to surface it.
- All documented in the pipeline doc, quickstart, deployment guide, and ADRs (including body-size limit note).
- Mock provider returns a clear 501 with a user-facing message.

Async/worker-based clip rendering, manual cut editing, and Zoom Cloud OAuth integration are explicitly **not** in V1.
