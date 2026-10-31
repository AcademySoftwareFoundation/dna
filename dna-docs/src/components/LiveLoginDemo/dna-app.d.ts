// Types for the DNA app modules that docs demos import through the
// `@dna-app` alias (plugins/dna-app-embed.ts). Declared here rather than
// type-checked from the app's source, which needs the app's own Vite and
// dependency setup. Keep in step with frontend/packages/app/src.

declare module '@dna-app/components/ProjectSelector' {
  import type {ReactNode} from 'react';

  export const STORAGE_KEYS: {USER_EMAIL: string; PROJECT: string};

  export function ProjectSelector(props: {
    onSelectionComplete: (
      project: {id: string; name?: string},
      playlist: {id: string; code?: string},
      userEmail: string,
    ) => void;
  }): ReactNode;
}

declare module '@dna-app/components/NoteEditor' {
  import type {ReactNode, Ref} from 'react';

  export interface SearchResult {
    type: string;
    id: string;
    name: string;
    email?: string;
  }

  /** The app's LocalDraftNote (hooks/useDraftNote.ts). */
  export interface LocalDraftNote {
    content: string;
    subject: string;
    to: SearchResult[];
    cc: SearchResult[];
    links: SearchResult[];
    versionStatus: string;
    published: boolean;
    edited: boolean;
    publishedNoteId: string | null;
    attachmentIds: string[];
  }

  export interface NoteEditorHandle {
    appendContent: (content: string) => void;
  }

  export function NoteEditor(props: {
    projectId?: string | null;
    currentVersion?: {
      type: 'Version';
      id: string;
      name?: string;
      user?: {type: 'User'; id: string; name?: string};
    } | null;
    draftNote: LocalDraftNote | null;
    updateDraftNote: (updates: Partial<LocalDraftNote>) => void;
    saveAttachmentIds: (ids: string[]) => Promise<void>;
    variant?: 'default' | 'embedded';
    onNoteContentBlur?: () => void;
    defaultHeight?: number;
    ref?: Ref<NoteEditorHandle>;
  }): ReactNode;
}

declare module '@dna-app/components/SplitButton' {
  import type {ReactNode} from 'react';

  export function SplitButton(props: {
    children?: ReactNode;
    onClick?: () => void;
    menuItems?: {label: string; onSelect?: () => void}[];
    disabled?: boolean;
  }): ReactNode;
}

declare module '@dna-app/components/AddVersionInput' {
  import type {ReactNode} from 'react';

  export function AddVersionInput(props: {
    playlistId: string;
    projectId?: string;
    existingVersionIds?: string[];
    onClose: () => void;
    onVersionAdded?: (version: {type: 'Version'; id: string; name?: string}) => void;
  }): ReactNode;
}

declare module '@dna-app/components/ChangePlaylistInput' {
  import type {ReactNode} from 'react';

  export function ChangePlaylistInput(props: {
    projectId: string;
    currentPlaylistId?: string;
    onSelect: (playlist: {type: 'Playlist'; id: string; code?: string}) => void;
    onClose: () => void;
  }): ReactNode;
}

declare module '@dna-app/components/VersionCard' {
  import type {ReactNode} from 'react';

  export function VersionCard(props: {
    version: {type: 'Version'; id: string; name?: string};
    artistName?: string;
    thumbnailUrl?: string;
    selected?: boolean;
    onClick?: () => void;
  }): ReactNode;
}

declare module '@dna-app/styles/theme' {
  import type {ThemeProps} from '@radix-ui/themes';

  export type AccentName = 'purple' | 'blue' | 'green' | 'pink';

  export const ACCENTS: Record<
    AccentName,
    {label: string; radix: NonNullable<ThemeProps['accentColor']>}
  >;

  /** The parts of the app's theme the docs demos read directly. */
  export interface Theme {
    colors: {
      accent: {main: string; hover: string; subtle: string; glow: string; gradient: string};
      status: {success: string; warning: string; error: string; info: string};
      bg: {base: string; elevated: string; surface: string; surfaceHover: string; overlay: string};
      sidebar: {bg: string; border: string};
      text: {primary: string; secondary: string; muted: string; inverse: string};
      border: {subtle: string; default: string; strong: string};
    };
  }

  export function getTheme(mode: 'dark' | 'light', accent?: AccentName): Theme;
}
