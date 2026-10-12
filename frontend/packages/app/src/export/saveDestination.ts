import type { ExportDestination, ExportFileType } from '@dna/core';

type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

/**
 * Ask where to save, returning a destination, or null if the user cancelled.
 * Must run straight from the click: browsers only show the save dialog with a
 * fresh user gesture, so call this before any slow work. Browsers without the
 * File System Access API (Firefox, Safari) fall back to a normal download.
 */
export async function chooseSaveDestination(
  suggestedName: string,
  fileType: ExportFileType
): Promise<ExportDestination | null> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker })
    .showSaveFilePicker;

  if (!picker) {
    return async (data) => {
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = suggestedName;
      link.click();
      URL.revokeObjectURL(url);
    };
  }

  try {
    const handle = await picker({
      suggestedName,
      types: [
        {
          description: fileType.description,
          accept: { [fileType.mimeType]: [fileType.extension] },
        },
      ],
    });
    return async (data) => {
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}
