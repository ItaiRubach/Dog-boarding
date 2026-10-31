// Opens a real invite link and checks the calendar file it would hand to the phone.
import { chromium } from 'playwright-core';
import { encodeInvite } from '../src/logic/messages.js';
const [base, out] = process.argv.slice(2);
const inv = { i: 'demo1', t: 'טופי', s: new Date(2026, 10, 10, 8).getTime(), e: new Date(2026, 10, 13, 18).getTime(), r: [7, 2] };
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}invite.html#${encodeInvite(inv)}`);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/11-invite.png` });
const ics = decodeURIComponent((await page.getAttribute('#apple', 'href')).split(',')[1]);
console.log('events:', (ics.match(/BEGIN:VEVENT/g) || []).length, '| alarms:', ics.match(/TRIGGER:[^\r]+/g).join(' '), '| google:', (await page.getAttribute('#google', 'href')).slice(0, 60));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
