import fs from 'fs';
import path from 'path';
import type {LoadContext, Plugin} from '@docusaurus/types';

/**
 * Lets docs pages render real components from the DNA app
 * (frontend/packages/app/src) as live demos, e.g. the login screen in
 * src/components/LiveLoginDemo.
 *
 * - `@dna-app/...` resolves to the app's source.
 * - The app's API and contexts modules are swapped for the fakes in
 *   src/components/LiveLoginDemo/appMocks when imported from the app's
 *   components folder, so demos need no backend or auth provider (both would
 *   also pull in Vite-only `import.meta.env`).
 * - SVGs under the app's source load as URLs, as they do in Vite, rather
 *   than as React components (Docusaurus' SVGR default for TSX imports).
 * - Shared libraries always resolve from dna-docs/node_modules: the app's
 *   own node_modules isn't installed in CI, and a second React or
 *   styled-components instance would break hooks and theming.
 */
export default function dnaAppEmbed(context: LoadContext): Plugin {
  // Real path: the bundler reports module contexts with symlinks resolved.
  const appSrc = fs.realpathSync(
    path.resolve(context.siteDir, '../frontend/packages/app/src'),
  );
  const appComponents = path.join(appSrc, 'components');
  const mocks = path.resolve(
    context.siteDir,
    'src/components/LiveLoginDemo/appMocks',
  );
  const docsModules = path.resolve(context.siteDir, 'node_modules');

  // Request (as written in the app's components) -> fake module.
  const replacements: Record<string, string> = {
    '../api': path.join(mocks, 'api.ts'),
    '../contexts': path.join(mocks, 'contexts.ts'),
  };

  return {
    name: 'dna-app-embed',
    configureWebpack(config, _isServer, utils) {
      // The SVG rule is a oneOf: SVGR for JS/TSX importers, then the plain
      // URL loader. Route the app's SVGs to the URL loader first.
      const svgRule = config.module?.rules?.find(
        (rule): rule is {oneOf: object[]} =>
          !!rule &&
          typeof rule === 'object' &&
          'oneOf' in rule &&
          String(rule.test) === String(/\.svg$/i),
      );
      if (!svgRule) {
        throw new Error("dna-app-embed: couldn't find Docusaurus' SVG rule.");
      }
      const urlLoader = svgRule.oneOf[svgRule.oneOf.length - 1];
      svgRule.oneOf.unshift({...urlLoader, include: appSrc});

      const {NormalModuleReplacementPlugin} = utils.currentBundler.instance;
      return {
        resolve: {
          alias: {
            '@dna-app': appSrc,
            // Only types are imported from @dna/core; keep its runtime
            // (API client and friends) out of the docs bundle.
            '@dna/core$': path.join(mocks, 'core.ts'),
            react: path.join(docsModules, 'react'),
            'react-dom': path.join(docsModules, 'react-dom'),
            'styled-components': path.join(docsModules, 'styled-components'),
            '@radix-ui/themes': path.join(docsModules, '@radix-ui/themes'),
          },
        },
        plugins: [
          new NormalModuleReplacementPlugin(
            /^\.\.\/(api|contexts)$/,
            (resource: {request: string; context: string}) => {
              if (resource.context === appComponents) {
                resource.request = replacements[resource.request];
              }
            },
          ),
        ],
      };
    },
  };
}
