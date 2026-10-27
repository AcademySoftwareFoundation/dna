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

declare module '@dna-app/styles/theme' {
  import type {ThemeProps} from '@radix-ui/themes';

  export type AccentName = 'purple' | 'blue' | 'green' | 'pink';

  export const ACCENTS: Record<
    AccentName,
    {label: string; radix: NonNullable<ThemeProps['accentColor']>}
  >;

  export function getTheme(mode: 'dark' | 'light', accent?: AccentName): object;
}
