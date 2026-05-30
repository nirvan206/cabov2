import React from 'react';
import { Card as GameCard } from '../../../types/game';
import { Card } from '../Card/Card';

interface DiscardStackProps {
  cards: GameCard[];
  label: string;
  faceDown?: boolean;
}

export const DiscardStack: React.FC<DiscardStackProps> = ({
  cards,
  label,
  faceDown = false,
}) => {
  if (cards.length === 0) {
    return (
      <div className="discard-stack-wrap">
        <div className="discard-label">{label}</div>
        <div className="discard-empty-slot card-sm">
          <span className="text-xs text-white/30">—</span>
        </div>
      </div>
    );
  }

  const topCard = cards[cards.length - 1];

  return (
    <div className="discard-stack-wrap">
      <div className="discard-label">{label} ({cards.length})</div>
      <div className="relative">
        <Card
          card={{ ...topCard, faceUp: !faceDown }}
          size="small"
        />
        {cards.length > 1 && (
          <div className="discard-count-badge">{cards.length}</div>
        )}
      </div>
    </div>
  );
};