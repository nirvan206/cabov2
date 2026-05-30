import React from 'react';
import { Card as GameCard } from '../../../types/game';

interface DeckProps {
  cards: GameCard[];
  canDraw?: boolean;
  onDraw?: () => void;
}

export const Deck: React.FC<DeckProps> = ({
  cards,
  canDraw = false,
  onDraw,
}) => {
  return (
    <div
      className={`deck-container ${!canDraw ? 'disabled' : ''}`}
      onClick={canDraw ? onDraw : undefined}
    >
      {/* Shadow cards for stack depth */}
      {cards.length > 2 && (
        <div
          className="deck-shadow-card card-md"
          style={{ top: 4, left: 3, zIndex: 1 }}
        />
      )}
      {cards.length > 1 && (
        <div
          className="deck-shadow-card card-md"
          style={{ top: 2, left: 1.5, zIndex: 2 }}
        />
      )}

      {/* Top card */}
      <div className="deck-top-card card-md" style={{ position: 'relative', zIndex: 3 }}>
        <div className="card-back-outer-frame" />
        <div className="card-back-inner-frame" />
        <div className="card-back-pattern" />
        <span className="deck-label">Deck</span>
        <span className="deck-count">{cards.length}</span>
      </div>

      {/* Draw hint */}
      {canDraw && cards.length > 0 && (
        <div className="draw-hint">Draw</div>
      )}
    </div>
  );
};