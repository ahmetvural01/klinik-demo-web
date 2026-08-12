import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const EXCLUDES = ['/superadmin/', '/system/', '/profile/', '/dev/'];
const CONTEXT_ONLY_ROUTES = new Set([
  'src/app/api/branches/active/route.ts',
  'src/app/api/finance/[id]/route.ts',
]);

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(p));
    else if (e.isFile() && /\.(ts|tsx|js|mjs)$/.test(e.name)) files.push(p);
  }
  return files;
}

function isExcluded(path) {
  const normalized = path.replace(/\\/g, '/');
  return EXCLUDES.some((segment) => normalized.includes(segment));
}

function main() {
  const base = join(process.cwd(), 'src', 'app', 'api');
  let all = [];
  try {
    all = walk(base);
  } catch (e) {
    console.error('Error reading api folder:', e?.message || e);
    process.exit(2);
  }

  const suspects = [];
  for (const f of all) {
    if (isExcluded(f)) continue;
    const relative = f.replace(process.cwd() + '\\', '').replace(/\\/g, '/');
    if (CONTEXT_ONLY_ROUTES.has(relative)) continue;
    const content = readFileSync(f, 'utf8');
    if (content.includes('requireAuth')) {
      if (!content.includes('institutionId')) {
        suspects.push(f.replace(process.cwd() + '\\', ''));
      }
    }
  }

  if (suspects.length === 0) {
    console.log('No suspect files found in filtered scan.');
    process.exit(0);
  }

  console.log('Filtered suspect files:');
  for (const s of suspects) console.log(' -', s);
  process.exit(0);
}

main();
