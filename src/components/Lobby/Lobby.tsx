import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useMPStore } from '../../store/mpStore';

interface LobbyProps {
  onGameJoined: (gameId: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onGameJoined }) => {
  const { profile, signOut } = useAuthStore();
  const { createGame, joinGame, loading, error, setError } = useMPStore();

  const [joinId, setJoinId] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [numDecks, setNumDecks] = useState(2);
  const [view, setView] = useState<'home' | 'create'>('home');

  const handleCreate = async () => {
    const gameId = await createGame(maxPlayers, numDecks);
    if (gameId) onGameJoined(gameId);
  };

  const handleJoin = async () => {
    const id = joinId.trim();
    if (!id) return;
    const success = await joinGame(id);
    if (success) onGameJoined(id);
  };

  return (
    <div className="lobby-screen">

      {/* Header */}
      <div className="lobby-header">
        <div className="lobby-logo">🃏 CABO</div>
        <div className="lobby-user">
          {profile?.avatar_url && (
            <img src={profile.avatar_url} className="lobby-avatar" alt="avatar" />
          )}
          <span className="lobby-username">{profile?.username}</span>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign Out</button>
        </div>
      </div>

      {/* Main content */}
      <div className="lobby-content">

        {error && (
          <div className="lobby-error">
            ⚠️ {error}
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {view === 'home' && (
          <div className="lobby-home animate-fade-in">
            <div className="lobby-welcome">
              <div className="lobby-welcome-icon">🃏</div>
              <h1 className="lobby-welcome-title">Ready to play?</h1>
              <p className="lobby-welcome-sub">Create a new game or join one with a Game ID</p>
            </div>

            {/* Join by ID */}
            <div className="lobby-section">
              <div className="lobby-section-label">Join a Game</div>
              <div className="lobby-join-row">
                <input
                  className="lobby-input"
                  placeholder="Paste Game ID here..."
                  value={joinId}
                  onChange={e => setJoinId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                />
                <button
                  className="btn btn-green"
                  disabled={!joinId.trim() || loading}
                  onClick={handleJoin}
                >
                  {loading ? '...' : 'Join →'}
                </button>
              </div>
            </div>

            <div className="lobby-divider">
              <span>or</span>
            </div>

            {/* Create */}
            <button
              className="btn btn-gold btn-lg w-full"
              onClick={() => setView('create')}
            >
              + Create New Game
            </button>
          </div>
        )}

        {view === 'create' && (
          <div className="lobby-create animate-fade-in">
            <button className="lobby-back" onClick={() => setView('home')}>
              ← Back
            </button>

            <h2 className="lobby-create-title">New Game</h2>

            <div className="lobby-create-option">
              <label>Players <span className="lobby-option-range">2 – 6</span></label>
              <div className="lobby-player-select">
                {[2, 3, 4, 5, 6].map(n => (
                  <button
                    key={n}
                    className={`lobby-player-btn ${maxPlayers === n ? 'active' : ''}`}
                    onClick={() => setMaxPlayers(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="lobby-create-option">
              <label>Decks <span className="lobby-option-range">1 – 3</span></label>
              <div className="lobby-player-select">
                {[1, 2, 3].map(n => (
                  <button
                    key={n}
                    className={`lobby-player-btn ${numDecks === n ? 'active' : ''}`}
                    onClick={() => setNumDecks(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="lobby-create-summary">
              <span>👥 {maxPlayers} players</span>
              <span>🃏 {numDecks} deck{numDecks > 1 ? 's' : ''} · {numDecks * 52} cards</span>
            </div>

            <div className="lobby-create-note">
              ⏱ Rooms expire after 5 minutes if the game doesn't start
            </div>

            <button
              className="btn btn-green btn-lg w-full"
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? 'Creating...' : '🚀 Create Game'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
