import React from 'react';
import { useGameStore } from '../../store/gameStore';

export const CaboButton: React.FC = () => {
  const { gamePhase, currentPlayerIndex, caboCalled, drawnCard, callCabo } = useGameStore();

  // Only show for human player, during playing phase, when they haven't drawn yet, and cabo hasn't been called
  if (
    gamePhase !== 'playing' ||
    caboCalled ||
    currentPlayerIndex !== 0 ||
    drawnCard !== null
  ) {
    return null;
  }

  return (
    <div className="cabo-button">
      <button className="cabo-btn" onClick={callCabo}>
        Cabo!
      </button>
    </div>
  );
};
