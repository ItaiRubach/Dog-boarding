import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The server function runs a copy of src/logic. Run `node scripts/sync-shared.mjs` after changing it.
it('server copy of the logic matches the app', () => {
  for (const f of ['util.js', 'pricing.js', 'occupancy.js', 'messages.js', 'digest.js']) {
    const app = readFileSync(`src/logic/${f}`, 'utf8');
    const server = readFileSync(`supabase/functions/_shared/logic/${f}`, 'utf8');
    expect(server, f).toBe(app);
  }
});
