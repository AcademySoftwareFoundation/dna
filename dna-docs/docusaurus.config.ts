import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import type * as OpenApiPlugin from 'docusaurus-plugin-openapi-docs';
import type {PluginOptions as SearchOptions} from '@easyops-cn/docusaurus-search-local';
import dnaAppEmbed from './plugins/dna-app-embed';
import searchHighlight from './plugins/search-highlight';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// CI sets these from the repository Pages settings. Local `npm start` leaves
// them unset so the dev server stays at `/`.
const docsUrl = process.env.DOCS_URL;
const docsBaseUrl = process.env.DOCS_BASE_URL;

function withBaseSlash(baseUrl: string): string {
  if (baseUrl === '' || baseUrl === '/') {
    return '/';
  }
  const withLeading = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

type PrismTheme = typeof prismThemes.oneLight;

// Recolour the One themes' green (strings, attr values, ...) to the emerald
// used by the POST badge and 2xx tab in custom.css. Light mode takes a
// darker shade of that emerald so code text stays readable on the pale
// code background.
function withEmeraldStrings(
  theme: PrismTheme,
  green: string,
  emerald: string,
): PrismTheme {
  return {
    ...theme,
    styles: theme.styles.map((entry) =>
      entry.style.color === green
        ? {...entry, style: {...entry.style, color: emerald}}
        : entry,
    ),
  };
}

const config: Config = {
  title: 'DNA Docs',
  tagline: 'A tool that combines live transcription and LLM integration to help VFX teams capture review feedback.',
  favicon: 'img/favicon.svg',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Local builds keep the dev origin and a root base path. The GitHub Pages
  // workflow overrides both from the repository Pages settings.
  url: docsUrl && docsUrl.length > 0 ? docsUrl : 'http://localhost:3000',
  baseUrl: docsBaseUrl ? withBaseSlash(docsBaseUrl) : '/',

  // Used by `npm run deploy` to push the build to GitHub Pages.
  organizationName: 'AcademySoftwareFoundation',
  projectName: 'dna',
  deploymentBranch: 'gh-pages',

  onBrokenLinks: 'throw',

  // Same DM Sans the app loads (frontend/packages/app/src/index.css), plus a
  // monospace face for code.
  stylesheets: [
    {
      href: 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@400;500&display=swap',
      type: 'text/css',
    },
  ],

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        // Frontend docs: the default docs instance, plain MDX at /docs.
        // Deliberately left on the stock doc item component - only the API
        // instance below opts into @theme/ApiItem.
        docs: {
          sidebarPath: './sidebars.ts',
        },
        // No blog on this site - it's a documentation site.
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    // Lets guides embed real DNA app components as live demos.
    dnaAppEmbed,
    // On-page search highlights for in-body results only.
    searchHighlight,
    // Backend docs: a second content-docs instance at /api, rendered with the
    // OpenAPI theme's doc item so generated pages get the API demo panel.
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'api',
        path: 'api',
        routeBasePath: 'api',
        sidebarPath: './sidebarsApi.ts',
        docItemComponent: '@theme/ApiItem',
      },
    ],
    [
      'docusaurus-plugin-openapi-docs',
      {
        id: 'openapi',
        // Generate into the 'api' docs instance declared above.
        docsPluginId: 'api',
        config: {
          backend: {
            // Copied from the backend's committed spec (backend/docs/openapi.json)
            // by scripts/fetch-openapi.sh, which also injects `servers`.
            specPath: 'openapi/backend.json',
            // Generated into a subfolder so the hand-written api/index.mdx
            // landing page survives clean-api-docs.
            outputDir: 'api/reference',
            sidebarOptions: {
              // The spec's x-tagGroups split tags into "Production Tracking"
              // (proxied to the provider) and "DNA" (DNA's own storage).
              groupPathsBy: 'tagGroup',
              categoryLinkSource: 'tag',
            },
          } satisfies OpenApiPlugin.Options,
        },
      },
    ],
    // Required by docusaurus-theme-openapi-docs, which ships .scss.
    'docusaurus-plugin-sass',
  ],

  themes: [
    'docusaurus-theme-openapi-docs',
    // Offline search: the index is built with the site, so it works on
    // GitHub Pages with no external service. Only in production builds -
    // `npm start` shows the search bar but has no index to search.
    [
      '@easyops-cn/docusaurus-search-local',
      {
        // Both docs instances: frontend guides and the backend API.
        docsRouteBasePath: ['docs', 'api'],
        docsDir: ['docs', 'api'],
        indexBlog: false,
        hashed: true,
        explicitSearchResultPath: true,
        highlightSearchTermsOnTargetPage: true,
        // Icon-only search that opens on click (custom.css); no hotkey.
        searchBarShortcut: false,
        searchBarShortcutHint: false,
      } satisfies SearchOptions,
    ],
  ],

  themeConfig: {
    // Dark-first like the DNA app; the navbar toggle still switches to light.
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: false,
    },
    navbar: {
      logo: {
        alt: 'DNA Docs Logo',
        src: 'img/logo-full-light.svg',   // light mode
        srcDark: 'img/logo-full-dark.svg', // dark mode
      },

      items: [
        {to: '/about', label: 'About', position: 'right'},
        // Lands on the Introduction rather than the generated Guides
        // category index; stays highlighted anywhere in the frontend docs.
        {
          type: 'doc',
          docId: 'guides/introduction',
          position: 'right',
          label: 'Frontend',
        },
        {
          type: 'docSidebar',
          docsPluginId: 'api',
          sidebarId: 'openApiSidebar',
          position: 'right',
          label: 'Backend API',
        },
        {
          href: 'https://github.com/AcademySoftwareFoundation/dna',
          label: 'GitHub',
          position: 'right',
        },
        // Last right-hand item: sits just left of the light/dark toggle, and
        // stays in the bar (top right) on mobile.
        {type: 'search', position: 'right'},
      ],
    },
    footer: {
      // 'light' lets custom.css colour the footer to match the page in both
      // modes; 'dark' hardcodes Infima's grey.
      style: 'light',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Frontend',
              to: '/docs',
            },
            {
              label: 'Backend API',
              to: '/api',
            },
          ],
        },
        {
          title: 'Project',
          items: [
            {
              label: 'DNA on GitHub',
              href: 'https://github.com/AcademySoftwareFoundation/dna',
            },
            {
              label: 'Academy Software Foundation',
              href: 'https://www.aswf.io/',
            },
          ],
        },
        {
          title: 'This Site',
          items: [
            {
              label: 'About',
              to: '/about',
            },
            {
              label: 'Source',
              href: 'https://github.com/AcademySoftwareFoundation/dna/tree/main/dna-docs',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Dailies Notes Assistant: A Project of The Academy Software Foundation`,
    },
    prism: {
      theme: withEmeraldStrings(
        prismThemes.oneLight,
        'hsl(119, 34%, 47%)',
        '#059669',
      ),
      darkTheme: withEmeraldStrings(
        prismThemes.oneDark,
        'hsl(95, 38%, 62%)',
        '#34d399',
      ),
      // bash isn't in prism-react-renderer's default bundle; needed for the
      // cURL tab below and the shell blocks in the guides.
      additionalLanguages: ['bash'],
    },
    // Code-sample tabs shown in the API demo panel. Unset, the OpenAPI theme
    // offers all 18 generator targets; keep it to the commonly used ones.
    // Tabs render in this order.
    languageTabs: [
      // The theme has no 'bash' logo; 'curl' gets the tab its curl styling,
      // and custom.css swaps in the official curl symbol.
      {language: 'curl', highlight: 'bash', logoClass: 'curl'},
      // Default to requests; http.client stays available as a variant sub-tab.
      {language: 'python', highlight: 'python', logoClass: 'python', variant: 'requests'},
      // Browser fetch - what the frontend and Chrome extension actually use.
      {language: 'javascript', highlight: 'javascript', logoClass: 'javascript', variant: 'fetch'},
      {language: 'c', highlight: 'c', logoClass: 'c'},
      {language: 'rust', highlight: 'rust', logoClass: 'rust'},
      {language: 'go', highlight: 'go', logoClass: 'go'},
    ],
  } satisfies Preset.ThemeConfig,
};

export default config;
