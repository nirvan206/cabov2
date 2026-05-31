import React, { useState, useEffect } from 'react';
import { useMPStore } from '../../store/mpStore';
import { useAuthStore } from '../../store/authStore';

interface WaitingRoomProps {
  gameId: string;
  onGameStart: () => void;
  onLeave: () => void;
}

export const WaitingRoom: React.FC<WaitingRoomProps> = ({ gameId, onGameStart, onLeave }) => {
  const { players, game, loadGameState, startGame, leaveGame, mySeat, loading, error, setError } = useMPStore();
  const { profile } = useAuthStore();
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Load initial state and poll for updates while waiting
  useEffect(() => {
    loadGameState(gameId);
    // Poll every 3s as fallback (realtime subscription in App.tsx handles live updates)
    const interval = setInterval(() => loadGameState(gameId), 3000);
    return () => clearInterval(interval);
  }, [gameId]);

  // Transition to game when host starts
  useEffect(() => {
    if (game?.phase === 'peeking' || game?.phase === 'playing') {
      onGameStart();
    }
  }, [game?.phase]);

  const copyGameId = () => {
    navigator.clipboard.writeText(gameId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCancel = async () => {
    setCancelling(true);
    await leaveGame();
    onLeave();
  };

  const handleLeave = async () => {
    await leaveGame();
    onLeave();
  };

  const isHost = mySeat === 0;
  const canStart = players.length >= 2;
  const maxPlayers = game?.max_players ?? 4;
  const emptySlots = Math.max(0, maxPlayers - players.length);

  return (
    <div className="waiting-screen">
      <div className="waiting-card animate-fade-in">

        {/* Header */}
        <div className="waiting-header">
          <div className="waiting-title">🃏 Waiting Room</div>
          {isHost && (
            <span className="waiting-host-pill">HOST</span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="waiting-error">
            ⚠️ {error}
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* Game ID */}
        <div className="waiting-game-id">
          <span className="waiting-id-label">Game ID — share with friends</span>
          <div className="waiting-id-row">
            <code className="waiting-id">{gameId}</code>
            <button className="btn btn-ghost btn-sm" onClick={copyGameId}>
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
          </div>
        </div>

        {/* Players */}
        <div className="waiting-players">
          <div className="waiting-players-title">
            Players <span className="waiting-players-count">{players.length} / {maxPlayers}</span>
          </div>

          {/* Filled slots */}
          {players.map((p) => (
            <div key={p.id} className="waiting-player-row">
              <div className="waiting-player-avatar">
                {p.avatar_url
                  ? <img src={p.avatar_url} className="waiting-avatar" alt="" />
                  : <div className="waiting-avatar-placeholder">
                      {p.username?.[0]?.toUpperCase() ?? '?'}
                    </div>
                }
                <div className="waiting-player-status online" />
              </div>
              <span className="waiting-player-name">
                {p.username}
                {p.seat_index === 0 && <span className="waiting-host-badge">HOST</span>}
                {p.seat_index === mySeat && <span className="waiting-you-badge">YOU</span>}
              </span>
              <span className="waiting-seat">Seat {p.seat_index + 1}</span>
            </div>
          ))}

          {/* Empty slots */}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <div key={`empty-${i}`} className="waiting-player-row waiting-empty">
              <div className="waiting-avatar-placeholder empty-slot">⏳</div>
              <span className="waiting-player-name empty-text">Waiting for player...</span>
            </div>
          ))}
        </div>

        {/* Status message */}
        {isHost && !canStart && (
          <div className="waiting-tip">
            Need at least 2 players to start. Share the Game ID above!
          </div>
        )}
        {!isHost && (
          <div className="waiting-tip">⏳ Waiting for the host to start the game...</div>
        )}

        {/* Actions */}
        <div className="waiting-actions">
          {isHost ? (
            <>
              <button
                className={`btn btn-green btn-lg w-full ${!canStart ? 'btn-disabled' : ''}`}
                disabled={!canStart || loading}
                onClick={startGame}
              >
                {loading ? '⏳ Starting...' : canStart ? '🚀 Start Game' : '⏳ Waiting for players...'}
              </button>
              <button
                className="btn btn-danger w-full mt-2"
                disabled={cancelling}
                onClick={handleCancel}
              >
                {cancelling ? 'Cancelling...' : '✕ Cancel Game'}
              </button>
            </>
          ) : (
            <button className="btn btn-ghost w-full" onClick={handleLeave}>
              Leave Game
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
