import React, { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { Card } from './Card/Card';

export const RoundEndModal: React.FC = () => {
  const { gamePhase, players, currentRound, nextRound } = useGameStore();
  const [reviewing, setReviewing] = useState(false);

  if (gamePhase !== 'roundEnd') return null;

  const sorted = [...players].sort((a, b) => {
    const aScore = a.roundScores[a.roundScores.length - 1] || 0;
    const bScore = b.roundScores[b.roundScores.length - 1] || 0;
    return aScore - bScore;
  });

  /* ── Review Cards View ── */
  if (reviewing) {
    return (
      <div className="modal-backdrop modal-backdrop-light">
        <div className="modal-box modal-box-wide animate-fade-in">
          <div className="modal-title">Round {currentRound} — All Cards</div>

          <div className="review-cards-grid">
            {players.map(player => {
              const roundScore = player.roundScores[player.roundScores.length - 1] || 0;
              return (
                <div key={player.id} className="review-player-section">
                  <div className="review-player-name">
                    {player.name}
                    <span className="review-player-score">{roundScore} pts</span>
                  </div>
                  <div className="review-player-cards">
                    {player.cards.map(card => (
                      <Card
                        key={card.id}
                        card={card}
                        size="medium"
                        forceShow={true}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="modal-buttons-row">
            <button
              className="btn btn-ghost btn-lg"
              onClick={() => setReviewing(false)}
            >
              ← Back
            </button>
            <button
              className="btn btn-green btn-lg"
              onClick={nextRound}
            >
              Next Round
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Score Summary View ── */
  return (
    <div className="modal-backdrop modal-backdrop-light">
      <div className="modal-box animate-fade-in">
        <div className="modal-title">Round {currentRound} Complete</div>
        <div className="modal-subtitle">
          👑 {sorted[0].name} wins the round!
        </div>

        <div>
          {sorted.map((player, index) => {
            const roundScore = player.roundScores[player.roundScores.length - 1] || 0;
            return (
              <div
                key={player.id}
                className={`modal-row ${index === 0 ? 'winner' : 'normal'}`}
              >
                <span className="font-semibold">
                  {index === 0 && '👑 '}{player.name}
                </span>
                <span className="text-sm text-white/70">
                  Round: {roundScore} · Total: {player.totalScore}
                </span>
              </div>
            );
          })}
        </div>

        <div className="modal-buttons-row">
          <button
            className="btn btn-blue btn-lg"
            onClick={() => setReviewing(true)}
          >
            🃏 Review Cards
          </button>
          <button
            className="btn btn-green btn-lg"
            onClick={nextRound}
          >
            Next Round
          </button>
        </div>
      </div>
    </div>
  );
};
