import React, { useState, useEffect } from 'react';
import { useMPStore } from '../../store/mpStore';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';

interface WaitingRoomProps {
  gameId: string;
  onGameStart: () => void;
  onLeave: () => void;
}

export const WaitingRoom: React.FC<WaitingRoomProps> = ({ gameId, onGameStart, onLeave }) => {
  const { players, game, loadGameState, startGame, leaveGame, mySeat, loading } = useMPStore();
  const { profile } = useAuthStore();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadGameState(gameId);
    const unsub = useMPStore.getState().subscribeToGame(gameId);
    return unsub;
  }, [gameId]);

  // Watch for game phase change → start playing
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

  const handleLeave = async () => {
    await leaveGame();
    onLeave();
  };

  const isHost = mySeat === 0;
  const canStart = players.length >= 2;

  return (
    <div className="waiting-screen">
      <div className="waiting-card animate-fade-in">
        <div className="waiting-title">🃏 Waiting Room</div>

        <div className="waiting-game-id">
          <span className="waiting-id-label">Game ID</span>
          <div className="waiting-id-row">
            <code className="waiting-id">{gameId}</code>
            <button className="btn btn-ghost btn-sm" onClick={copyGameId}>
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
          </div>
          <p className="waiting-id-hint">Share this ID with friends to join</p>
        </div>

        <div className="waiting-players">
          <div className="waiting-players-title">
            Players ({players.length}/{game?.max_players ?? 4})
          </div>
          {players.map((p) => (
            <div key={p.id} className="waiting-player-row">
              {p.avatar_url
                ? <img src={p.avatar_url} className="waiting-avatar" alt="" />
                : <div className="waiting-avatar-placeholder">👤</div>
              }
              <span className="waiting-player-name">
                {p.username}
                {p.seat_index === 0 && <span className="waiting-host-badge">HOST</span>}
                {p.seat_index === mySeat && <span className="waiting-you-badge">YOU</span>}
              </span>
              <span className="waiting-seat">Seat {p.seat_index + 1}</span>
            </div>
          ))}
          {/* Empty slots */}
          {Array.from({ length: (game?.max_players ?? 4) - players.length }).map((_, i) => (
            <div key={`empty-${i}`} className="waiting-player-row waiting-empty">
              <div className="waiting-avatar-placeholder">⏳</div>
              <span className="waiting-player-name">Waiting for player...</span>
            </div>
          ))}
        </div>

        <div className="waiting-actions">
          {isHost ? (
            <button
              className="btn btn-green btn-lg w-full"
              disabled={!canStart || loading}
              onClick={startGame}
            >
              {loading ? 'Starting...' : canStart ? '🚀 Start Game' : 'Need at least 2 players'}
            </button>
          ) : (
            <div className="waiting-host-note">⏳ Waiting for host to start...</div>
          )}
          <button className="btn btn-ghost btn-sm w-full mt-2" onClick={handleLeave}>
            Leave Game
          </button>
        </div>
      </div>
    </div>
  );
};
