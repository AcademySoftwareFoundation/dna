import path from 'path';
import type {LoadContext, Plugin} from '@docusaurus/types';

/**
 * Search results highlight the matched words on the page they open, but
 * only for in-body matches: page-title and heading results just open the
 * page. The search plugin has no option for this, so ./search-highlight-loader.js
 * patches the one condition at build time (and fails the build if a plugin
 * update changes it).
 */
export default function searchHighlight(context: LoadContext): Plugin {
  return {
    name: 'search-highlight-content-only',
    configureWebpack() {
      return {
        module: {
          rules: [
            {
              test: /docusaurus-search-local[\\/]dist[\\/]client[\\/]client[\\/]theme[\\/](SearchBar[\\/]SearchBar|SearchPage[\\/]SearchPage)\.jsx$/,
              enforce: 'pre',
              use: [path.join(context.siteDir, 'plugins/search-highlight-loader.js')],
            },
          ],
        },
      };
    },
  };
}
