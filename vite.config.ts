import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Stamped into the bundle so a stale install on a wall tablet is easy to spot.
function commit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: {
    __LF_VERSION__: JSON.stringify(pkg.version),
    __LF_COMMIT__: JSON.stringify(commit()),
  },
  build: {
    lib: {
      entry: 'src/luxframe.ts',
      formats: ['es'],
      fileName: () => 'luxframe.js',
    },
    outDir: 'dist',
    target: 'es2021',
  },
});
