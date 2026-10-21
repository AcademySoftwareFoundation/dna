# ShotGrid Configuration Guide

How to prepare a ShotGrid site so DNA can publish meeting transcripts and link
each published note to its transcript. A ShotGrid **site admin** does the
ShotGrid steps; whoever deploys DNA does the [DNA settings](#4-dna-settings).

You need this only for transcript publishing. Notes, statuses and attachments
publish without it.

| Step | Where | What |
|------|-------|------|
| 1 | ShotGrid | Enable a custom entity to hold transcripts |
| 2 | ShotGrid | Add the transcript fields to it |
| 3 | ShotGrid | Add the `sg_linked_transcript` field to **Note** |
| 4 | DNA | Point DNA at the custom entity and turn publishing on |
| 5 | ShotGrid | Give the DNA script user the permissions it needs |
| 6 | Both | Check it works |

---

## 1. Enable a custom entity for transcripts

1. Go to **Admin menu → Site Preferences → Entities**.
2. Pick an unused **Custom Entity** slot (for example `CustomEntity01`), turn
   it on, and give it a display name such as **Transcript**.
3. Note the slot's **API name** (`CustomEntity01`, `CustomEntity05`, …). DNA
   addresses the entity by this name, not the display name.
4. If a project hides the entity in its **Tracking Settings**, DNA can still
   create rows there, but users won't see the Transcript page. Show it for
   every project that uses DNA.

## 2. Add the transcript fields

On the custom entity, create these fields. **The field codes must match
exactly**; display names are up to you.

| Field code | Type | Points to | Written by DNA |
|------------|------|-----------|----------------|
| `code` | Text (built in, the entity's name) | | `transcript-<version id>-<YYYY-MM-DD>` |
| `project` | Entity (built in) | Project | The version's project |
| `sg_playlist` | Entity | Playlist | Playlist the review ran on |
| `sg_version_in_review` | Entity | Version | Version the transcript belongs to |
| `sg_meeting_id` | Text | | Meeting ID from the call |
| `sg_meeting_date` | Date | | Date of the first transcript segment (UTC) |
| `sg_platform` | List | | `google_meet`, `teams` or `zoom` |
| `sg_transcript_body` | Text | | Full transcript, one `Speaker: text` line per turn |

- **`sg_platform` list values:** add `google_meet`, `teams` and `zoom` exactly
  as written. ShotGrid rejects a value that isn't in the list, and the publish
  fails.
- **Optional `sg_summary` (Text):** DNA never writes it, so staff can add a
  summary by hand without a republish overwriting it.
- **Republishing** a changed transcript updates `sg_transcript_body` and
  `sg_meeting_date` on the existing row. It never renames the row or changes
  its links.

## 3. Add `sg_linked_transcript` to Note

This links each note DNA publishes to the transcript of the version it's on, so
reviewers can jump from a note to what was said.

On the **Note** entity, create:

| Field code | Type | Points to |
|------------|------|-----------|
| `sg_linked_transcript` | Entity (single) | Your transcript custom entity (e.g. `CustomEntity01`) |

- Allow **only** the transcript custom entity as the valid type.
- ShotGrid offers to create a **reverse field** on the custom entity. Accept it
  to see a transcript's notes from the Transcript page.
- DNA fills the field when it publishes a note on a version whose transcript
  has been published. When no transcript was recorded or published, it stays
  blank.
- DNA finds the transcript in ShotGrid (the version's newest transcript row),
  not in its own database, so ShotGrid is the only source of truth for the link.
- Republishing a note sets the field again, so a note published before its
  transcript picks up the link the next time it's republished.
- DNA writes the link as the **script user**, after the note is created as its
  author, so authors' permission groups don't need edit rights on this field.
- If the field doesn't exist, DNA logs a warning and publishes the note without
  the link; nothing fails.
- The review CSV export (**Publish → Export CSV**) shows the same transcript
  name in its **Linked Transcript** column.

## 4. DNA settings

Set these in the backend environment and restart the API:

```bash
DNA_ENABLE_TRANSCRIPT_PUBLISH=true
SHOTGRID_TRANSCRIPT_ENTITY=CustomEntity01   # the slot from step 1
```

| Variable | Default | Meaning |
|----------|---------|---------|
| `DNA_ENABLE_TRANSCRIPT_PUBLISH` | `false` | Turns on `POST /playlists/{id}/publish-transcript`. Off, that endpoint returns 404: notes still publish, transcripts don't. |
| `SHOTGRID_TRANSCRIPT_ENTITY` | `CustomEntity01` | API name of the transcript custom entity. |

These are on top of the usual ShotGrid connection settings (`SHOTGRID_URL`,
`SHOTGRID_SCRIPT_NAME`, `SHOTGRID_API_KEY`; see
[QUICKSTART.md](../../QUICKSTART.md)).

**Changing the slot later:** rows DNA already published keep updating in the
slot they were created in, because DNA records the entity type for each one.
Only new transcripts go to the new slot.

## 5. Script user permissions

DNA talks to ShotGrid as the API script in `SHOTGRID_SCRIPT_NAME`. Its
permission role needs:

| Entity | Access | Why |
|--------|--------|-----|
| Transcript custom entity | Read, create, update | Publish and republish transcripts |
| Note | Read, create, update | Publish notes and set `sg_linked_transcript` |
| Version | Read, update | Read versions and apply status changes |
| Playlist, Project, Shot, Asset | Read | Links and project lookups |
| HumanUser | Read | Match note authors by email |
| Attachment | Create | Upload images attached to notes |

DNA creates each note **as its author** (ShotGrid `sudo_as_login`), so the
script must also be allowed to act on behalf of other users.

## 6. Check it works

1. In DNA, open a playlist with a recorded transcript, add a note to the
   version in review, and publish with that version's transcript selected.
2. In ShotGrid, open the Transcript page: there's a row named
   `transcript-<version id>-<date>` with the body, playlist and version filled in.
3. Open the published note: **Linked Transcript** points to that row.
4. Publish a note on a version with no transcript: **Linked Transcript** stays
   blank.

If the transcript publish fails, the backend log has ShotGrid's error. The
usual causes are a misspelled field code, a missing `sg_platform` list value,
or a missing permission.
