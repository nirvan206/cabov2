import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cardsDir = path.join(__dirname, '..', 'src', 'assets', 'cards');

if (!fs.existsSync(cardsDir)) {
  fs.mkdirSync(cardsDir, { recursive: true });
}

const baseUrl = 'https://raw.githubusercontent.com/notpeter/Vector-Playing-Cards/master/cards-svg/';

const suits = ['C', 'D', 'H', 'S'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const cards = [];
for (const rank of ranks) {
  for (const suit of suits) {
    cards.push(`${rank}${suit}`);
  }
}

async function downloadFileWithRetry(name, retries = 3) {
  const url = `${baseUrl}${name}.svg`;
  const destPath = path.join(cardsDir, `${name}.svg`);

  // Check if file already exists and is non-empty
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 100) {
    console.log(`${name}.svg already downloaded. Skipping.`);
    return;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`Downloading ${name}.svg (Attempt ${attempt}/${retries})...`);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const text = await res.text();
      // Verify it's actually an SVG
      if (!text.includes('<svg')) {
        throw new Error('Response is not a valid SVG file.');
      }
      fs.writeFileSync(destPath, text);
      console.log(`Successfully saved ${name}.svg`);
      return; // Success!
    } catch (err) {
      console.error(`Attempt ${attempt} failed for ${name}.svg: ${err.message}`);
      if (attempt === retries) {
        console.error(`Failed to download ${name}.svg after ${retries} attempts.`);
      } else {
        // Wait 1 second before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}

async function run() {
  for (const card of cards) {
    await downloadFileWithRetry(card);
  }
  console.log('All downloads checked and completed!');
}

run();
