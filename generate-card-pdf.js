const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument({ size: 'A4', margin: 40 });
const outputPath = path.join('C:', 'Users', 'Nirvan', 'Downloads', 'cabo-card-designs.pdf');
const output = fs.createWriteStream(outputPath);
doc.pipe(output);

const cardsDir = path.join(__dirname, 'src', 'assets', 'cards');
const backImg = path.join(__dirname, 'src', 'assets', 'card-back.png');

const CARD_W = 150;
const CARD_H = 210;
const GAP = 20;
const PAGE_W = 595 - 80; // A4 width minus margins
const PAGE_H = 842 - 80;

// Title page
doc.fontSize(36).font('Helvetica-Bold').fillColor('#1a7a45')
   .text('CABO', { align: 'center' });
doc.fontSize(14).font('Helvetica').fillColor('#666')
   .text('Card Designs Reference Sheet', { align: 'center' });
doc.moveDown(2);

doc.fontSize(10).fillColor('#999')
   .text('Generated from the Cabo game project', { align: 'center' });
doc.text('All designs used in the current build', { align: 'center' });

// ─── Page 2: Card Back ───
doc.addPage();
doc.fontSize(20).font('Helvetica-Bold').fillColor('#0a1530')
   .text('Card Back Design', { align: 'center' });
doc.moveDown(1);

const backX = (PAGE_W - CARD_W * 1.5) / 2 + 40;
doc.image(backImg, backX, doc.y, { width: CARD_W * 1.5, height: CARD_H * 1.5 });

// ─── Page 3: Aces ───
doc.addPage();
doc.fontSize(20).font('Helvetica-Bold').fillColor('#c41e3a')
   .text('Aces', { align: 'center' });
doc.moveDown(1);

const aces = [
  { file: 'ace_spades.png', label: 'Ace of Spades' },
  { file: 'ace_hearts.png', label: 'Ace of Hearts' },
  { file: 'ace_diamonds.png', label: 'Ace of Diamonds' },
  { file: 'ace_clubs.png', label: 'Ace of Clubs' },
];

let startY = doc.y;
aces.forEach((ace, i) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const x = 40 + col * (CARD_W + GAP);
  const y = startY + row * (CARD_H + GAP + 20);
  
  const imgPath = path.join(cardsDir, ace.file);
  if (fs.existsSync(imgPath)) {
    doc.image(imgPath, x, y, { width: CARD_W, height: CARD_H });
    doc.fontSize(9).font('Helvetica').fillColor('#333')
       .text(ace.label, x, y + CARD_H + 4, { width: CARD_W, align: 'center' });
  }
});

// ─── Page 4: Face Cards ───
doc.addPage();
doc.fontSize(20).font('Helvetica-Bold').fillColor('#d4af37')
   .text('Face Cards (Jack, Queen, King)', { align: 'center' });
doc.moveDown(1);

const faceCards = [
  { file: 'jack.png', label: 'Jack (all suits)' },
  { file: 'queen.png', label: 'Queen (all suits)' },
  { file: 'king.png', label: 'King (all suits)' },
];

startY = doc.y;
faceCards.forEach((card, i) => {
  const x = 40 + i * (CARD_W + GAP);
  const y = startY;
  
  const imgPath = path.join(cardsDir, card.file);
  if (fs.existsSync(imgPath)) {
    doc.image(imgPath, x, y, { width: CARD_W, height: CARD_H });
    doc.fontSize(9).font('Helvetica').fillColor('#333')
       .text(card.label, x, y + CARD_H + 4, { width: CARD_W, align: 'center' });
  }
});

// ─── Page 5: Number Cards Info ───
doc.addPage();
doc.fontSize(20).font('Helvetica-Bold').fillColor('#1a1a2e')
   .text('Number Cards (2–10)', { align: 'center' });
doc.moveDown(1);

doc.fontSize(12).font('Helvetica').fillColor('#444')
   .text('Number cards use CSS-rendered pip layouts with suit symbols (♠ ♥ ♦ ♣) arranged in traditional playing card positions.', { align: 'center' });
doc.moveDown(1);

doc.fontSize(11).font('Helvetica').fillColor('#666');
const pipInfo = [
  '2  →  Two pips vertically centered',
  '3  →  Three pips in a vertical column',
  '4  →  Four pips in a 2×2 grid',
  '5  →  Four corners + one center pip',
  '6  →  Two columns of three pips',
  '7  →  Two columns of three + one center',
  '8  →  Two columns of three + two center',
  '9  →  Three rows of three pips',
  '10 →  Standard 10-pip arrangement',
];
pipInfo.forEach(line => {
  doc.text(line, { align: 'center' });
  doc.moveDown(0.3);
});

doc.moveDown(2);
doc.fontSize(10).fillColor('#999')
   .text('Suit colors: ♥♦ = Red (#c41e3a)  |  ♠♣ = Black (#1a1a2e)', { align: 'center' });
doc.text('Font: Playfair Display (serif) for corner values', { align: 'center' });

// Finalize
doc.end();

output.on('finish', () => {
  console.log(`✅ PDF saved to: ${outputPath}`);
});
