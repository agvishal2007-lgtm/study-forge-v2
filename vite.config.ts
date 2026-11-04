import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Writes the service worker after each build, listing every file the site needs to open with no
 * internet. Its name changes with the files, which is how a browser knows a new version exists.
 */
function offlineWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'study-forge-offline-worker',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },
    closeBundle() {
      const walk = (folder: string): string[] => readdirSync(folder, { withFileTypes: true })
        .flatMap((entry) => (entry.isDirectory() ? walk(join(folder, entry.name)) : [join(folder, entry.name)]));
      const paths = walk(outDir).filter((path) => !path.endsWith('sw.js') && !path.endsWith('.map'));
      const hash = createHash('sha256');
      for (const path of [...paths].sort()) hash.update(path).update(readFileSync(path));
      // The picture reader is large and only some students need it, so it's saved the first time it's used.
      const files = paths.map((path) => `./${relative(outDir, path).split('\\').join('/')}`).filter((path) => !path.startsWith('./ocr/'));
      const template = readFileSync('src/sw-template.js', 'utf8');
      writeFileSync(
        join(outDir, 'sw.js'),
        template.replace('__VERSION__', hash.digest('hex').slice(0, 16)).replace('"__FILES__"', JSON.stringify(files)),
      );
    },
  };
}

/** Keeps the picture reader on this site, so it needs no other service. It only downloads when someone uses it. */
function pictureReader(): Plugin {
  let outDir = 'dist';
  return {
    name: 'study-forge-picture-reader',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },
    closeBundle() {
      const folder = join(outDir, 'ocr');
      mkdirSync(folder, { recursive: true });
      cpSync('node_modules/tesseract.js/dist/worker.min.js', join(folder, 'worker.min.js'));
      for (const name of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) cpSync(`node_modules/tesseract.js-core/${name}`, join(folder, name));
      cpSync('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', join(folder, 'eng.traineddata.gz'));
    },
  };
}

// base './' lets the built site work from any folder on a static host.
export default defineConfig({ plugins: [react(), pictureReader(), offlineWorker()], base: './' });
