import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const violations = [];
async function inspect(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory() && path !== join(root, 'tests')) await inspect(path);
    if (!item.isFile() || !/\.[cm]?[jt]s$/.test(item.name)) continue;
    const text = await readFile(path, 'utf8');
    if (
      /@prisma\/|\bPrismaClient\b|\bPrismaService\b|\$(?:queryRaw|executeRaw)(?:Unsafe)?\b|['"](?:\.\.\/)+prisma\//.test(
        text,
      )
    )
      violations.push(relative(root, path));
  }
}

await inspect(root);
const manifest = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
for (const name of Object.keys(manifest.dependencies ?? {})) {
  if (name === 'prisma' || name.startsWith('@prisma/'))
    violations.push('package.json dependencies: ' + name);
}
if (violations.length) {
  console.error(
    'Prisma database access is restricted to CLI tools and fixtures.',
  );
  for (const file of violations) console.error(file);
  process.exitCode = 1;
} else {
  console.info('API runtime uses only PostgreSQL database access.');
}
