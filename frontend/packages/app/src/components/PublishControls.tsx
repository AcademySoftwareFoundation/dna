import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import styled, { useTheme } from 'styled-components';
import { ChevronDown } from 'lucide-react';
import { Button, DropdownMenu } from '@radix-ui/themes';
import { SCRATCH_VERSION_ID } from '@dna/core';
import type { DraftNote, Exporter, Version } from '@dna/core';
import { PublishDialog } from './PublishDialog';
import { scopePublishToVersion } from './publishScope';
import { createReviewExporters } from '../export/exporters';
import { loadReviewExportData } from '../export/loadReviewExportData';
import { chooseSaveDestination } from '../export/saveDestination';
import { useGetVersionsForPlaylist } from '../api';
import { usePlaylistDraftNotes, usePlaylistMetadata } from '../hooks';
import { useFeatureFlags, useNomenclature, useToast } from '../contexts';

interface PublishControlsProps {
  playlistId: string | null;
  projectId: string | null;
  userEmail: string;
  selectedVersionId?: string | null;
}

const PublishSplit = styled.div`
  display: flex;

  & > button:first-child {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  & > button:last-child {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    padding: 0 6px;
    box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.25);
  }
`;

export function PublishControls({
  playlistId,
  projectId,
  userEmail,
  selectedVersionId,
}: PublishControlsProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const theme = useTheme();
  const t = useNomenclature();
  const { transcriptionEnabled } = useFeatureFlags();
  const { data: versions } = useGetVersionsForPlaylist(playlistId);
  const { data: playlistMetadata } = usePlaylistMetadata(playlistId);
  const { data: draftNotes } = usePlaylistDraftNotes(playlistId);
  const [publishScope, setPublishScope] = useState<'all' | 'selected' | null>(
    null
  );
  const [exportingLabel, setExportingLabel] = useState<string | null>(null);

  const hasScratch = !!playlistMetadata?.has_scratch;
  const scratchVersion = useMemo<Version>(
    () => ({
      type: 'Version',
      id: SCRATCH_VERSION_ID,
      name: 'SCRATCH PAD',
      notes: [],
      ...(projectId != null
        ? { project: { type: 'Project', id: projectId } }
        : {}),
    }),
    [projectId]
  );
  const exporters = useMemo(
    () => createReviewExporters({ accent: theme.colors.accent.main, terms: t }),
    [theme.colors.accent.main, t]
  );

  const publishDialogNotes = useMemo(
    () =>
      (draftNotes ?? []).filter((note: DraftNote) => {
        const hasContent =
          Boolean(note.content?.trim()) || Boolean(note.attachment_ids?.length);
        const needsPublishing =
          !note.published || note.edited || Boolean(note.attachment_ids?.length);
        return hasContent && needsPublishing;
      }),
    [draftNotes]
  );
  const publishDialogInput = useMemo(
    () =>
      publishScope === 'selected'
        ? scopePublishToVersion(
            publishDialogNotes,
            versions ?? [],
            selectedVersionId
          )
        : { notes: publishDialogNotes, versions: versions ?? [] },
    [publishScope, publishDialogNotes, versions, selectedVersionId]
  );

  const handleExport = async (exporter: Exporter) => {
    if (!playlistId) return;
    const { label, extension } = exporter.fileType;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const destination = await chooseSaveDestination(
        `dna-review-playlist-${playlistId}-${today}${extension}`,
        exporter.fileType
      );
      if (!destination) return;
      setExportingLabel(label);

      const data = await loadReviewExportData({
        playlistId,
        projectId,
        versions: [
          ...(hasScratch ? [scratchVersion] : []),
          ...(versions ?? []),
        ],
        userEmail,
        transcriptionEnabled,
        queryClient,
        terms: t,
      });
      await exporter.export(data, destination);
      const count = data.rows.length;
      showToast({
        title: `${label} exported`,
        description: `${count} ${count === 1 ? t.version.lower : t.version.lowerPlural} saved.`,
        type: 'success',
      });
    } catch (err) {
      showToast({
        title: `${label} export failed`,
        description: err instanceof Error ? err.message : String(err),
        type: 'error',
      });
    } finally {
      setExportingLabel(null);
    }
  };

  return (
    <>
      <PublishSplit>
        <Button size="2" variant="solid" onClick={() => setPublishScope('all')}>
          {t.publish.verb}
        </Button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <Button
              size="2"
              variant="solid"
              aria-label={`More ${t.publish.lower} options`}
            >
              <ChevronDown size={14} />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item
              disabled={!selectedVersionId}
              onSelect={() => setPublishScope('selected')}
            >
              {t.publish.verb} Selected
            </DropdownMenu.Item>
            {exporters.map((exporter) => {
              const { label } = exporter.fileType;
              return (
                <DropdownMenu.Item
                  key={label}
                  disabled={!playlistId || exportingLabel !== null}
                  onSelect={() => void handleExport(exporter)}
                >
                  {exportingLabel === label
                    ? `Exporting ${label}…`
                    : `Export ${label}`}
                </DropdownMenu.Item>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </PublishSplit>
      {playlistId && (
        <PublishDialog
          open={publishScope !== null}
          onClose={() => setPublishScope(null)}
          playlistId={playlistId}
          userEmail={userEmail}
          notes={publishDialogInput.notes}
          versions={publishDialogInput.versions}
        />
      )}
    </>
  );
}
