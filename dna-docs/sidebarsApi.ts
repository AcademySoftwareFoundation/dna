import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';
import apiSidebar from './api/reference/sidebar';

/**
 * Sidebar for the backend API docs (the 'api' docs instance, served at /api).
 *
 * `api/reference/sidebar.ts` is emitted by `npm run gen-api-docs` from the
 * OpenAPI spec and is gitignored - regenerate it rather than editing by hand.
 * Because this file imports it, the generator must run before
 * `docusaurus build`; `npm run build:full` chains the two.
 */
const sidebars: SidebarsConfig = {
  openApiSidebar: [
    'index',
    {
      type: 'category',
      label: 'Reference',
      collapsed: false,
      items: apiSidebar,
    },
  ],
};

export default sidebars;
