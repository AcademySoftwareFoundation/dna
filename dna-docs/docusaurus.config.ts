import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import type * as OpenApiPlugin from 'docusaurus-plugin-openapi-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'DNA Docs',
  tagline: 'Frontend guides and backend API reference',
  favicon: 'img/favicon.svg',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Production URL. Configured for a GitHub Pages project site; if you deploy
  // to a custom domain or a host that serves from the root (Netlify, Vercel,
  // Cloudflare Pages), set url to that origin and baseUrl back to '/'.
  url: 'https://camerontarget14.github.io',
  baseUrl: '/dna-docs/',

  // Used by `npm run deploy` to push the build to GitHub Pages.
  organizationName: 'camerontarget14',
  projectName: 'dna-docs',
  deploymentBranch: 'gh-pages',

  onBrokenLinks: 'throw',

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
              groupPathsBy: 'tag',
              categoryLinkSource: 'tag',
            },
          } satisfies OpenApiPlugin.Options,
        },
      },
    ],
    // Required by docusaurus-theme-openapi-docs, which ships .scss.
    'docusaurus-plugin-sass',
  ],

  themes: ['docusaurus-theme-openapi-docs'],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      logo: {
        alt: 'DNA Docs Logo',
        src: 'img/logo-full-light.svg',   // light mode
        srcDark: 'img/logo-full-dark.svg', // dark mode
      },

      items: [
        {to: '/about', label: 'About', position: 'right'},
        {
          type: 'docSidebar',
          sidebarId: 'frontendSidebar',
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
      ],
    },
    footer: {
      style: 'dark',
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
              href: 'https://github.com/camerontarget14/dna-docs',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Dailies Notes Assistant: A Project of The Academy Software Foundation`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['ruby', 'csharp', 'php', 'java', 'powershell'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
