import React, { useState } from 'react';
import { useGameStore } from '../../store/gameStore';

export const SetupScreen: React.FC = () => {
  const [playerCount, setPlayerCount] = useState(4);
  const [deckCount, setDeckCount] = useState(2);
  const { setupGame, dealInitialCards } = useGameStore();

  const handleStart = () => {
    setupGame(playerCount, deckCount);
    dealInitialCards();
  };

  return (
    <div className="setup-screen">
      <div className="setup-card animate-fade-in">
        {/* Decorative suits */}
        <div className="setup-suits">
          <span className="suit-red">♥</span>
          <span className="suit-black">♠</span>
          <span className="suit-red">♦</span>
          <span className="suit-black">♣</span>
        </div>

        <h1 className="setup-title">CABO</h1>
        <p className="setup-subtitle">The Card Game</p>

        <div className="setup-divider" />

        <div className="setup-options">
          <div className="setup-group">
            <label className="setup-label">Players</label>
            <div className="setup-selector">
              {[2, 3, 4].map(n => (
                <button
                  key={n}
                  className={`setup-chip ${playerCount === n ? 'active' : ''}`}
                  onClick={() => setPlayerCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="setup-group">
            <label className="setup-label">Decks</label>
            <div className="setup-selector">
              {[1, 2, 3].map(n => (
                <button
                  key={n}
                  className={`setup-chip ${deckCount === n ? 'active' : ''}`}
                  onClick={() => setDeckCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button className="setup-start" onClick={handleStart}>
          Deal Cards
        </button>

        <div className="setup-rules">
          <p>♠ Each player gets 4 cards</p>
          <p>♥ Peek at your bottom 2 for 5 seconds</p>
          <p>♦ Lowest total score wins the round</p>
          <p>♣ Call "Cabo" when you think you're lowest!</p>
        </div>
      </div>
    </div>
  );
};
