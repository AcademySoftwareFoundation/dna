import type { QueryClient } from '@tanstack/react-query';
import {
  buildReviewNotes,
  buildReviewRows,
  transcriptNamesByVersion,
  type Playlist,
  type ReviewExportData,
  type Version,
} from '@dna/core';
import { apiHandler } from '../api';

/**
 * Fetch everything a review export needs, fresh, so the file reflects the
 * latest saved notes. Optional details (status and author names, transcript
 * links, the playlist name) fall back quietly rather than failing the export.
 */
export async function loadReviewExportData({
  playlistId,
  projectId,
  versions,
  userEmail,
  transcriptionEnabled,
  queryClient,
}: {
  playlistId: string;
  projectId: string | null;
  /** Versions to export, scratch included, in sidebar order. */
  versions: Version[];
  userEmail: string;
  transcriptionEnabled: boolean;
  queryClient: QueryClient;
}): Promise<ReviewExportData> {
  const exportedAt = new Date();
  const [draftNotes, segmentEntries, statuses, transcripts, playlists] =
    await Promise.all([
      apiHandler.getPlaylistDraftNotes(playlistId),
      Promise.all(
        versions.map(async (v) => {
          const segments = transcriptionEnabled
            ? await apiHandler.getSegmentsForVersion({
                playlistId,
                versionId: v.id,
              })
            : [];
          return [v.id, segments] as const;
        })
      ),
      apiHandler
        .getVersionStatuses({ projectId: projectId ?? undefined })
        .catch(() => []),
      apiHandler.getPublishedTranscripts(playlistId).catch(() => []),
      projectId
        ? queryClient
            .fetchQuery<Playlist[]>({
              // Same key as useGetPlaylistsForProject, so the cached list is reused.
              queryKey: ['playlists', projectId],
              queryFn: () => apiHandler.getPlaylistsForProject({ projectId }),
              staleTime: 5 * 60 * 1000,
            })
            .catch(() => [])
        : Promise.resolve([]),
    ]);

  const authorEmails = [...new Set(draftNotes.map((d) => d.user_email))];
  const authorNames = new Map(
    (
      await Promise.all(
        authorEmails.map((email) =>
          apiHandler
            .getUserByEmail({ userEmail: email })
            .then((user) => [email, user.name] as const)
            .catch(() => [email, undefined] as const)
        )
      )
    ).filter((entry): entry is [string, string] => !!entry[1])
  );

  const playlistName =
    playlists.find((p) => p.id === playlistId)?.code ||
    `Playlist ${playlistId}`;

  // The scratch tile only carries the project id; name it like the others.
  const projectNames = new Map(
    versions.flatMap((v) =>
      v.project?.name ? [[v.project.id, v.project.name] as const] : []
    )
  );
  const namedVersions = versions.map((v) =>
    v.project && !v.project.name && projectNames.has(v.project.id)
      ? {
          ...v,
          project: { ...v.project, name: projectNames.get(v.project.id) },
        }
      : v
  );

  return {
    rows: buildReviewRows(
      namedVersions,
      draftNotes,
      new Map(segmentEntries),
      userEmail,
      transcriptNamesByVersion(transcripts)
    ),
    notes: buildReviewNotes(namedVersions, draftNotes, {
      userEmail,
      playlistName,
      authorNames,
    }),
    title: playlistName,
    exportedAt,
    statusNames: new Map(statuses.map((s) => [s.code, s.name])),
  };
}
