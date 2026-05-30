import React from 'react';
import { Player } from '../../../types/game';
import { Card } from '../Card/Card';

interface PlayerAreaProps {
  player: Player;
  isCurrentPlayer?: boolean;
  position: 'top' | 'bottom' | 'left' | 'right';
  onCardClick?: (cardIndex: number, playerId: string) => void;
  selectedCardIndex?: number | null;
  isPeekPhase?: boolean;
  isHumanPlayer?: boolean;
  highlights?: {cardIndex: number; type: string}[];
}

export const PlayerArea: React.FC<PlayerAreaProps> = ({
  player,
  isCurrentPlayer = false,
  position,
  onCardClick,
  selectedCardIndex = null,
  isPeekPhase = false,
  isHumanPlayer = false,
  highlights = [],
}) => {
  const cardSize = 'medium';

  return (
    <div className="player-area animate-fade-in">
      {/* Player Info */}
      <div className="player-info">
        <div className={`player-name ${isCurrentPlayer ? 'active' : ''}`}>
          {isCurrentPlayer && <span className="turn-dot" />}
          {player.name}
        </div>
        <div className="player-score">
          Score: {player.totalScore}
        </div>
      </div>

      {/* Cards in 2×2 grid */}
      <div className="player-cards-grid">
        {player.cards.map((card, index) => {
          // During peek phase, only the human player sees their bottom 2 cards
          const showDuringPeek = isPeekPhase && isHumanPlayer && index >= 2;

          return (
            <Card
              key={card.id}
              card={card}
              size={cardSize}
              canInteract={true}
              onClick={() => onCardClick?.(index, player.id)}
              isSelected={isHumanPlayer && selectedCardIndex === index}
              forceShow={showDuringPeek}
              highlightType={highlights.find(h => h.cardIndex === index)?.type || null}
            />
          );
        })}
      </div>

      {/* Round history (compact, only for bottom player) */}
      {isHumanPlayer && player.roundScores.length > 0 && (
        <div className="mt-2 text-center">
          <div className="text-xs text-white/30">
            {player.roundScores.map((s, i) => `R${i + 1}: ${s}`).join(' · ')}
          </div>
        </div>
      )}
    </div>
  );
};