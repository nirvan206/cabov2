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

const STORAGE_KEY_GAME = 'cabo_active_game';
const STORAGE_KEY_SCREEN = 'cabo_screen';

const App: React.FC = () => {
  const { user, setSession, loadProfile, loading: authLoading } = useAuthStore();
  const { game, loadGameState, subscribeToGame, clearGame } = useMPStore();

  const [screen, setScreen] = useState<AppScreen>('auth');
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  // ── Persist screen + gameId to localStorage ─────────────────
  const goToScreen = (s: AppScreen, gameId?: string) => {
    setScreen(s);
    if (gameId) {
      setActiveGameId(gameId);
      localStorage.setItem(STORAGE_KEY_GAME, gameId);
      localStorage.setItem(STORAGE_KEY_SCREEN, s);
    } else if (s === 'lobby' || s === 'auth') {
      setActiveGameId(null);
      localStorage.removeItem(STORAGE_KEY_GAME);
      localStorage.removeItem(STORAGE_KEY_SCREEN);
    } else {
      localStorage.setItem(STORAGE_KEY_SCREEN, s);
    }
  };

  const handleLeave = () => {
    clearGame();
    goToScreen('lobby');
  };

  // ── Bootstrap auth session ───────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        loadProfile();
      } else {
        clearGame();
        goToScreen('auth');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Restore active game after auth resolves ──────────────────
  useEffect(() => {
    if (authLoading || restored) return;
    setRestored(true);

    if (!user) {
      setScreen('auth');
      return;
    }

    const savedGameId = localStorage.getItem(STORAGE_KEY_GAME);
    const savedScreen = localStorage.getItem(STORAGE_KEY_SCREEN) as AppScreen | null;

    if (savedGameId && savedScreen && (savedScreen === 'waiting' || savedScreen === 'game')) {
      // Validate the game still exists in DB
      supabase.from('games').select('id, status, phase').eq('id', savedGameId).single()
        .then(({ data }) => {
          if (!data || data.status === 'finished') {
            // Game gone — back to lobby
            localStorage.removeItem(STORAGE_KEY_GAME);
            localStorage.removeItem(STORAGE_KEY_SCREEN);
            setScreen('lobby');
          } else {
            // Restore to correct screen based on game phase
            const phase = data.phase;
            const restoredScreen =
              phase === 'lobby' || phase === 'waiting' ? 'waiting'
              : phase === 'round_end' || phase === 'game_end' ? 'game'
              : phase === 'playing' || phase === 'peeking' || phase === 'dealing' ? 'game'
              : 'waiting';

            setActiveGameId(savedGameId);
            setScreen(restoredScreen);
            localStorage.setItem(STORAGE_KEY_SCREEN, restoredScreen);
            loadGameState(savedGameId);
          }
        });
    } else {
      setScreen('lobby');
    }
  }, [authLoading, user, restored]);

  // ── Subscribe to game realtime ───────────────────────────────
  useEffect(() => {
    if (!activeGameId) return;
    const unsub = subscribeToGame(activeGameId);
    return unsub;
  }, [activeGameId]);

  // ── Keep localStorage screen in sync ────────────────────────
  useEffect(() => {
    if (screen === 'waiting' || screen === 'game') {
      localStorage.setItem(STORAGE_KEY_SCREEN, screen);
    }
  }, [screen]);

  // ── Splash while loading ─────────────────────────────────────
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
          onGameJoined={(gameId) => goToScreen('waiting', gameId)}
        />
      )}

      {screen === 'waiting' && activeGameId && (
        <WaitingRoom
          gameId={activeGameId}
          onGameStart={() => goToScreen('game', activeGameId)}
          onLeave={handleLeave}
        />
      )}

      {screen === 'game' && activeGameId && (
        <GameTable
          gameId={activeGameId}
          onLeave={handleLeave}
        />
      )}
    </div>
  );
};

export default App;