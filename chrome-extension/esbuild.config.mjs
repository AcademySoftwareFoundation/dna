import { build, context } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, 'dist');

const entryPoints = {
  'background/service-worker': 'src/background/service-worker.ts',
  'popup/popup': 'src/popup/popup.ts',
  'content/meet-dom': 'src/content/meet-dom.ts',
  'options/options': 'src/options/options.ts',
};

async function buildAll(watch = false) {
  mkdirSync(distDir, { recursive: true });

  const manifest = JSON.parse(
    readFileSync(join(__dirname, 'manifest.json'), 'utf8'),
  );
  writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  for (const file of ['popup/popup.html', 'options/options.html']) {
    cpSync(join(__dirname, 'src', file), join(distDir, file));
  }

  const config = {
    entryPoints,
    bundle: true,
    outdir: distDir,
    format: 'esm',
    target: 'chrome120',
    sourcemap: true,
  };

  if (watch) {
    const ctx = await context(config);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await build(config);
    console.log('Build complete:', distDir);
  }
}

const watch = process.argv.includes('--watch');
buildAll(watch).catch((error) => {
  console.error(error);
  process.exit(1);
});
