// Copies packages/survey-core/src → supabase/functions/_shared/survey-core so the
// Edge Function bundles the exact same validation/logic code as the browser.
// Run `npm run sync:core` after editing survey-core. CI fails if the copy is stale (`--check`).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
const SRC = 'packages/survey-core/src', DST = 'supabase/functions/_shared/survey-core';
const files = readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
const header = '// AUTO-COPIED from packages/survey-core/src by scripts/sync-core.mjs — do not edit here.\n';
if (process.argv.includes('--check')) {
  const stale = files.filter((f) => !existsSync(`${DST}/${f}`) || readFileSync(`${DST}/${f}`, 'utf8') !== header + readFileSync(`${SRC}/${f}`, 'utf8'));
  if (stale.length) { console.error('survey-core copy is stale:', stale.join(', '), '\nRun: npm run sync:core'); process.exit(1); }
  console.log('survey-core copy in sync'); process.exit(0);
}
rmSync(DST, { recursive: true, force: true });
mkdirSync(DST, { recursive: true });
for (const f of files) writeFileSync(`${DST}/${f}`, header + readFileSync(`${SRC}/${f}`, 'utf8'));
console.log(`synced ${files.length} files → ${DST}`);
