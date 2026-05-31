import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useMPStore } from '../../store/mpStore';
import { supabase } from '../../lib/supabase';

interface LobbyProps {
  onGameJoined: (gameId: string) => void;
}

interface GameListing {
  id: string;
  max_players: number;
  current_players: number;
  status: string;
  created_at: string;
}

export const Lobby: React.FC<LobbyProps> = ({ onGameJoined }) => {
  const { profile, signOut } = useAuthStore();
  const { createGame, joinGame, loading, error, setError } = useMPStore();
  const [games, setGames] = useState<GameListing[]>([]);
  const [joinId, setJoinId] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [numDecks, setNumDecks] = useState(2);
  const [tab, setTab] = useState<'browse' | 'create'>('browse');

  const loadGames = async () => {
    const { data } = await supabase
      .from('games')
      .select('id, max_players, status, created_at')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      const withCounts = await Promise.all(data.map(async (g) => {
        const { count } = await supabase
          .from('game_players')
          .select('*', { count: 'exact', head: true })
          .eq('game_id', g.id);
        return { ...g, current_players: count ?? 0 };
      }));
      setGames(withCounts);
    }
  };

  useEffect(() => {
    loadGames();
    const interval = setInterval(loadGames, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async () => {
    const gameId = await createGame(maxPlayers, numDecks);
    if (gameId) onGameJoined(gameId);
  };

  const handleJoin = async (gameId: string) => {
    const success = await joinGame(gameId);
    if (success) onGameJoined(gameId);
  };

  return (
    <div className="lobby-screen">
      <div className="lobby-header">
        <div className="lobby-logo">🃏 CABO</div>
        <div className="lobby-user">
          {profile?.avatar_url && <img src={profile.avatar_url} className="lobby-avatar" alt="avatar" />}
          <span className="lobby-username">{profile?.username}</span>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign Out</button>
        </div>
      </div>

      <div className="lobby-content">
        <div className="lobby-tabs">
          <button className={`lobby-tab ${tab === 'browse' ? 'active' : ''}`} onClick={() => setTab('browse')}>
            Browse Games
          </button>
          <button className={`lobby-tab ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>
            Create Game
          </button>
        </div>

        {error && (
          <div className="lobby-error">
            ⚠️ {error}
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {tab === 'browse' && (
          <div className="lobby-browse">
            <div className="lobby-join-row">
              <input
                className="lobby-input"
                placeholder="Paste game ID to join directly..."
                value={joinId}
                onChange={e => setJoinId(e.target.value)}
              />
              <button className="btn btn-green" disabled={!joinId} onClick={() => handleJoin(joinId)}>
                Join
              </button>
            </div>

            <div className="lobby-game-list">
              {games.length === 0 ? (
                <div className="lobby-empty">No open games — create one!</div>
              ) : (
                games.map(game => (
                  <div key={game.id} className="lobby-game-row">
                    <div className="lobby-game-info">
                      <span className="lobby-game-id">{game.id.slice(0, 8)}...</span>
                      <span className="lobby-game-players">
                        👥 {game.current_players}/{game.max_players} players
                      </span>
                    </div>
                    <button
                      className="btn btn-blue btn-sm"
                      disabled={game.current_players >= game.max_players || loading}
                      onClick={() => handleJoin(game.id)}
                    >
                      Join
                    </button>
                  </div>
                ))
              )}
            </div>

            <button className="btn btn-ghost btn-sm lobby-refresh" onClick={loadGames}>
              🔄 Refresh
            </button>
          </div>
        )}

        {tab === 'create' && (
          <div className="lobby-create">
            <div className="lobby-create-option">
              <label>Number of Players <span className="lobby-option-range">(2 – 6)</span></label>
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
              <label>Number of Decks <span className="lobby-option-range">(1 – 3)</span></label>
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
              <span>🃏 {numDecks} deck{numDecks > 1 ? 's' : ''} ({numDecks * 52} cards)</span>
            </div>

            <button className="btn btn-green btn-lg w-full" onClick={handleCreate} disabled={loading}>
              {loading ? 'Creating...' : '🚀 Create Game'}
            </button>

            <p className="lobby-create-note">
              Share the game ID with your friends to join
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
