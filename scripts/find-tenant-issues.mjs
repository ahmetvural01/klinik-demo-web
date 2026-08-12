import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

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
    const content = readFileSync(f, 'utf8');
    if (content.includes('requireAuth')) {
      if (!content.includes('institutionId')) {
        suspects.push(f.replace(process.cwd() + '\\', ''));
      }
    }
  }

  if (suspects.length === 0) {
    console.log('No suspect files found: all API files that import requireAuth also reference institutionId.');
    process.exit(0);
  }

  console.log('Suspect files (import requireAuth but no institutionId found):');
  for (const s of suspects) console.log(' -', s);
  process.exit(0);
}

main();
