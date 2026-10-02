/** The existing 512px PNG fits the ic09 entry. No Mac tooling is needed. */
import { readFileSync, writeFileSync } from 'node:fs';
const png = readFileSync(new URL('../assets/icon.png', import.meta.url));
if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    png.readUInt32BE(16) !== 512 || png.readUInt32BE(20) !== 512) {
  throw new Error('icon.png must be a 512 by 512 PNG for the ic09 entry.');
}
const header = Buffer.alloc(16);
header.write('icns', 0);
header.writeUInt32BE(16 + png.length, 4);
header.write('ic09', 8);
header.writeUInt32BE(8 + png.length, 12);
writeFileSync(new URL('../assets/icon.icns', import.meta.url), Buffer.concat([header, png]));
