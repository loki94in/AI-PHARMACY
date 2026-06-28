/**
 * Transpile every .ts file in src/ to dist-server/ using esbuild.
 * This is NOT a bundle — each file is transpiled individually so:
 *  - Dynamic imports work as-is
 *  - Native modules are left as require() calls
 *  - import.meta.url is preserved correctly per file
 */

import { build } from 'esbuild';
import { glob } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const outDir = path.join(root, 'dist-server');

// Collect all .ts files (excluding .d.ts)
async function collectTs(dir) {
  const entries = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        entries.push(full);
      }
    }
  }
  walk(dir);
  return entries;
}

const files = await collectTs(srcDir);
console.log(`[build:server] Transpiling ${files.length} TypeScript files…`);

try {
  await build({
    entryPoints: files,
    outbase: srcDir,
    outdir: outDir,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    bundle: false,          // <-- transpile only, no tree-shaking or import resolution
    sourcemap: false,
    logLevel: 'warning',
    // Strip TypeScript types; keep JS semantics intact
    loader: {
      '.ts': 'ts',
    },
  });
  console.log('[build:server] Done → dist-server/');
} catch (err) {
  console.error('[build:server] Failed:', err.message);
  process.exit(1);
}
