import React from 'react';
import { useGameStore } from '../../store/gameStore';

export const GameEndModal: React.FC = () => {
  const { gamePhase, players, resetGame } = useGameStore();

  if (gamePhase !== 'gameEnd') return null;

  const sorted = [...players].sort((a, b) => a.totalScore - b.totalScore);

  return (
    <div className="modal-backdrop modal-backdrop-light">
      <div className="modal-box animate-fade-in">
        <div className="modal-title" style={{ color: '#ffd700' }}>Game Over!</div>
        <div className="modal-subtitle">
          🏆 {sorted[0].name} wins with {sorted[0].totalScore} points!
        </div>

        <div>
          {sorted.map((player, index) => (
            <div
              key={player.id}
              className={`modal-row ${index === 0 ? 'winner' : 'normal'}`}
            >
              <span className="font-semibold">
                {index === 0 && '🏆 '}#{index + 1} {player.name}
              </span>
              <span className="text-sm">{player.totalScore} pts</span>
            </div>
          ))}
        </div>

        <div className="modal-history">
          {sorted.map(player => (
            <div key={player.id}>
              {player.name}: {player.roundScores.map((s, i) => `R${i + 1}:${s}`).join(', ')}
            </div>
          ))}
        </div>

        <button
          className="btn btn-blue btn-lg w-full mt-6"
          onClick={resetGame}
        >
          New Game
        </button>
      </div>
    </div>
  );
};
