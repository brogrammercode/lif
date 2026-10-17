import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// sanitize-html is CommonJS, while its current parser is ESM. Bundle this
// dependency so Vercel does not need CommonJS require(ESM) support at runtime.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'src/infra/vendor/sanitize-html.mjs');
await build({
  entryPoints: [resolve(root, 'node_modules/sanitize-html/index.js')],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  banner: {
    js: "import { createRequire as createNodeRequire } from 'node:module'; const require = createNodeRequire(import.meta.url);",
  },
  legalComments: 'eof',
});
// tsc does not copy assets; keep the existing compiled test entrypoints usable.
const testOutput = resolve(
  root,
  'dist-tests/src/infra/vendor/sanitize-html.mjs',
);
await mkdir(dirname(testOutput), { recursive: true });
await copyFile(output, testOutput);
console.log('Prepared ESM HTML sanitizer dependency.');
