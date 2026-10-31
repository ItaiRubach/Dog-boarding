// Copies the pure logic the server function needs, so app and server use the same code.
import { mkdirSync, copyFileSync } from 'node:fs';
const dest = new URL('../supabase/functions/_shared/logic/', import.meta.url);
mkdirSync(dest, { recursive: true });
for (const f of ['util.js', 'pricing.js', 'occupancy.js', 'messages.js', 'digest.js']) {
  copyFileSync(new URL(`../src/logic/${f}`, import.meta.url), new URL(f, dest));
  console.log('copied', f);
}
