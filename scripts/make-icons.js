// PNG icons for iPhone home screen (iOS ignores SVG there). Square, no rounding: iOS rounds itself.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8').replace('rx="27"', 'rx="0"');
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(new URL(`../public/${name}`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
  console.log('wrote', name);
}
