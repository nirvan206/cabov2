import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cardsDir = path.join(__dirname, '..', 'src', 'assets', 'cards');
const jackPath = path.join(cardsDir, 'jack.png');

if (fs.existsSync(jackPath)) {
  const buffer = fs.readFileSync(jackPath);
  let offset = 2;
  let found = false;
  
  while (offset < buffer.length) {
    if (buffer[offset] === 0xff) {
      const marker = buffer[offset + 1];
      if (marker === 0xc0 || marker === 0xc2) { // SOF0 or SOF2
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        console.log(`JPEG found SOF: ${width}x${height}`);
        found = true;
        break;
      }
      // skip marker length
      const length = buffer.readUInt16BE(offset + 2);
      offset += length + 2;
    } else {
      offset++;
    }
  }
  if (!found) {
    console.log('SOF marker not found');
  }
} else {
  console.log('jack.png not found');
}
