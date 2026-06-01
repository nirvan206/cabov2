const fs = require('fs');
const path = require('path');

const cardsDir = path.join(__dirname, '..', 'src', 'assets', 'cards');
const files = fs.readdirSync(cardsDir);

console.log('Files in src/assets/cards:');
files.forEach(file => {
  const filePath = path.join(cardsDir, file);
  const stats = fs.statSync(filePath);
  console.log(`- ${file}: ${stats.size} bytes`);
});
