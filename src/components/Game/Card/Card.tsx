import React from 'react';
import { motion } from 'framer-motion';
import { Card as GameCard } from '../../../types/game';
import { getCardDisplay, getSuitSymbol, isRedSuit } from '../../../utils/cardUtils';

/* ── Card face images ── */
import queenImg from '../../../assets/cards/queen.png';
import jackImg from '../../../assets/cards/jack.png';
import kingImg from '../../../assets/cards/king.png';
import aceSpades from '../../../assets/cards/ace_spades.png';
import aceHearts from '../../../assets/cards/ace_hearts.png';
import aceDiamonds from '../../../assets/cards/ace_diamonds.png';
import aceClubs from '../../../assets/cards/ace_clubs.png';

/* ── Ace images per suit ── */
const ACE_IMAGES: Record<string, string> = {
  spades: aceSpades,
  hearts: aceHearts,
  diamonds: aceDiamonds,
  clubs: aceClubs,
};

/* ── Court card images (same image for all suits) ── */
const COURT_IMAGES: Record<number, string> = {
  11: jackImg,
  12: queenImg,
  13: kingImg,
};

/* ── Pip positions for each card value: [top%, left%] ── */
const PIP_POSITIONS: Record<number, [number, number][]> = {
  2: [[22, 50], [78, 50]],
  3: [[20, 50], [50, 50], [80, 50]],
  4: [[20, 32], [20, 68], [80, 32], [80, 68]],
  5: [[20, 32], [20, 68], [50, 50], [80, 32], [80, 68]],
  6: [[20, 32], [20, 68], [50, 32], [50, 68], [80, 32], [80, 68]],
  7: [[18, 32], [18, 68], [36, 50], [50, 32], [50, 68], [82, 32], [82, 68]],
  8: [[18, 32], [18, 68], [36, 50], [50, 32], [50, 68], [64, 50], [82, 32], [82, 68]],
  9: [[16, 32], [16, 68], [38, 32], [38, 68], [50, 50], [62, 32], [62, 68], [84, 32], [84, 68]],
  10: [[16, 32], [16, 68], [30, 50], [38, 32], [38, 68], [62, 32], [62, 68], [70, 50], [84, 32], [84, 68]],
};

interface CardProps {
  card: GameCard;
  isSelected?: boolean;
  canInteract?: boolean;
  onClick?: () => void;
  size?: 'small' | 'medium' | 'large';
  forceShow?: boolean;
  highlightType?: string | null;
}

export const Card: React.FC<CardProps> = ({
  card,
  isSelected = false,
  canInteract = false,
  onClick,
  size = 'medium',
  forceShow = false,
  highlightType = null,
}) => {
  const isFaceUp = forceShow || card.faceUp;
  const red = isRedSuit(card.suit);
  const colorClass = red ? 'suit-red' : 'suit-black';
  const sizeClass = size === 'small' ? 'card-sm' : size === 'large' ? 'card-lg' : 'card-md';

  const display = getCardDisplay(card.value);
  const suit = getSuitSymbol(card.suit);
  const isAce = card.value === 1;
  const isCourt = card.value >= 11 && card.value <= 13;
  const isNumber = card.value >= 2 && card.value <= 10;
  const isJoker = card.value === 0;

  /* Get the face image for aces and court cards */
  const getFaceImage = (): string | null => {
    if (isAce) return ACE_IMAGES[card.suit] || null;
    if (isCourt) return COURT_IMAGES[card.value] || null;
    return null;
  };

  const faceImage = getFaceImage();

  return (
    <motion.div
      className={`card-wrapper ${sizeClass} ${canInteract ? 'interactive' : ''} ${highlightType ? `card-hl-${highlightType}` : ''}`}
      animate={{ scale: isSelected ? 1.1 : 1, y: isSelected ? -8 : 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      onClick={canInteract ? onClick : undefined}
      whileHover={canInteract ? { scale: 1.06, y: -3, transition: { duration: 0.15 } } : {}}
    >
      <div className={`card-flipper ${!isFaceUp ? 'flipped' : ''}`}>
        {/* ── FRONT FACE ── */}
        <div className="card-face-side">
          <div className={`card-face-inner ${colorClass}`}>
            {/* Corner: top-left */}
            <div className="card-corner card-corner-tl">
              <span className="card-corner-value">{display}</span>
              <span className="card-corner-suit">{suit}</span>
            </div>
            {/* Corner: bottom-right */}
            <div className="card-corner card-corner-br">
              <span className="card-corner-value">{display}</span>
              <span className="card-corner-suit">{suit}</span>
            </div>

            {/* ── Center Content ── */}
            <div className="card-center-area">
              {/* Ace & Court cards: use generated images */}
              {faceImage && (
                <img
                  src={faceImage}
                  alt={`${display} of ${card.suit}`}
                  className="card-face-image"
                  draggable={false}
                />
              )}

              {/* Joker */}
              {isJoker && <span className="card-joker-star">★</span>}

              {/* Number cards (2-10): CSS pip layout */}
              {isNumber && (
                <div className="card-pip-area">
                  {(PIP_POSITIONS[card.value] || []).map(([top, left], i) => (
                    <span
                      key={i}
                      className={`card-pip ${top > 55 ? 'pip-inverted' : ''}`}
                      style={{ top: `${top}%`, left: `${left}%` }}
                    >
                      {suit}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── BACK FACE ── */}
        <div className="card-back-side">
          <div className="card-back-inner">
            <div className="card-back-outer-frame" />
            <div className="card-back-inner-frame" />
            <div className="card-back-pattern" />
            <div className="card-back-medallion">
              <div className="card-back-diamond" />
            </div>
          </div>
        </div>
      </div>

      {isSelected && <div className="card-selected-glow" />}
    </motion.div>
  );
};