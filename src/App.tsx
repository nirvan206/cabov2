import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { useAuthStore } from './store/authStore';
import { useMPStore } from './store/mpStore';
import { AuthScreen } from './components/Auth/AuthScreen';
import { Lobby } from './components/Lobby/Lobby';
import { WaitingRoom } from './components/Lobby/WaitingRoom';
import { GameTable } from './components/Game/Table/GameTable';
import './App.css';

type AppScreen = 'auth' | 'lobby' | 'waiting' | 'game';

const App: React.FC = () => {
  const { user, setSession, loadProfile, loading: authLoading } = useAuthStore();
  const { game, loadGameState, subscribeToGame, clearGame } = useMPStore();
  const [screen, setScreen] = useState<AppScreen>('auth');
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  // ── Bootstrap auth session ──────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadProfile();
      else { setScreen('auth'); clearGame(); }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Route based on auth state ───────────────────────────────
  useEffect(() => {
    if (!authLoading) {
      setScreen(user ? 'lobby' : 'auth');
    }
  }, [user, authLoading]);

  // ── Subscribe to game when in waiting/game screen ───────────
  useEffect(() => {
    if (!activeGameId) return;
    const unsub = subscribeToGame(activeGameId);
    return unsub;
  }, [activeGameId]);

  if (authLoading) {
    return (
      <div className="splash-screen">
        <div className="splash-logo">🃏</div>
        <div className="splash-title">CABO</div>
        <div className="splash-spinner" />
      </div>
    );
  }

  return (
    <div className="App">
      {screen === 'auth' && <AuthScreen />}

      {screen === 'lobby' && (
        <Lobby
          onGameJoined={(gameId) => {
            setActiveGameId(gameId);
            setScreen('waiting');
          }}
        />
      )}

      {screen === 'waiting' && activeGameId && (
        <WaitingRoom
          gameId={activeGameId}
          onGameStart={() => setScreen('game')}
          onLeave={() => {
            setActiveGameId(null);
            clearGame();
            setScreen('lobby');
          }}
        />
      )}

      {screen === 'game' && activeGameId && (
        <GameTable
          gameId={activeGameId}
          onLeave={() => {
            setActiveGameId(null);
            clearGame();
            setScreen('lobby');
          }}
        />
      )}
    </div>
  );
};

export default App;