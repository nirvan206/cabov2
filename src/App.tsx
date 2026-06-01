import React, { useEffect, useState, lazy, Suspense } from 'react';
import { supabase } from './lib/supabase';
import { useAuthStore } from './store/authStore';
import { useMPStore } from './store/mpStore';
import { AuthScreen } from './components/Auth/AuthScreen';
import './App.css';

const Lobby = lazy(() => import('./components/Lobby/Lobby').then(m => ({ default: m.Lobby })));
const WaitingRoom = lazy(() => import('./components/Lobby/WaitingRoom').then(m => ({ default: m.WaitingRoom })));
const MPGameTable = lazy(() => import('./components/Game/Table/MPGameTable').then(m => ({ default: m.MPGameTable })));
const AccountPage = lazy(() => import('./components/Account/AccountPage').then(m => ({ default: m.AccountPage })));

type AppScreen = 'auth' | 'lobby' | 'account' | 'waiting' | 'game';

const STORAGE_KEY_GAME   = 'cabo_active_game';
const STORAGE_KEY_SCREEN = 'cabo_screen';

const App: React.FC = () => {
  const { user, setSession, loadProfile, loading: authLoading } = useAuthStore();
  const { game, loadGameState, subscribeToGame, clearGame } = useMPStore();

  const [screen, setScreen]         = useState<AppScreen>('auth');
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [restored, setRestored]     = useState(false);

  // ── Auto-kick if game terminates ─────────────────────────────
  useEffect(() => {
    if (game && game.phase === 'terminated' && screen !== 'lobby') {
      alert("The game was terminated by the host.");
      handleLeave();
    }
  }, [game?.phase, screen]);

  // ── Persist screen + gameId ──────────────────────────────────
  const goTo = (s: AppScreen, gameId?: string) => {
    setScreen(s);
    if (gameId) {
      setActiveGameId(gameId);
      localStorage.setItem(STORAGE_KEY_GAME, gameId);
      localStorage.setItem(STORAGE_KEY_SCREEN, s);
    } else if (s === 'lobby' || s === 'auth' || s === 'account') {
      // Don't wipe game state when just viewing account page
      if (s !== 'account') {
        setActiveGameId(null);
        localStorage.removeItem(STORAGE_KEY_GAME);
        localStorage.removeItem(STORAGE_KEY_SCREEN);
      }
    } else {
      localStorage.setItem(STORAGE_KEY_SCREEN, s);
    }
  };

  const handleLeave = () => {
    clearGame();
    setActiveGameId(null);
    localStorage.removeItem(STORAGE_KEY_GAME);
    localStorage.removeItem(STORAGE_KEY_SCREEN);
    setScreen('lobby');
  };

  // ── Bootstrap auth ───────────────────────────────────────────
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
        setActiveGameId(null);
        localStorage.removeItem(STORAGE_KEY_GAME);
        localStorage.removeItem(STORAGE_KEY_SCREEN);
        setScreen('auth');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Restore active game after auth resolves ──────────────────
  useEffect(() => {
    if (authLoading || restored) return;
    setRestored(true);

    if (!user) { setScreen('auth'); return; }

    const savedGameId = localStorage.getItem(STORAGE_KEY_GAME);
    const savedScreen = localStorage.getItem(STORAGE_KEY_SCREEN) as AppScreen | null;

    if (savedGameId && savedScreen && (savedScreen === 'waiting' || savedScreen === 'game')) {
      // 1. Check the game exists
      supabase.from('games').select('id, status, phase').eq('id', savedGameId).single()
        .then(async ({ data: gameData }) => {
          if (!gameData || gameData.status === 'finished') {
            localStorage.removeItem(STORAGE_KEY_GAME);
            localStorage.removeItem(STORAGE_KEY_SCREEN);
            setScreen('lobby');
            return;
          }
          // 2. Check this user is actually in the game
          const { data: playerRow } = await supabase
            .from('game_players')
            .select('seat_index')
            .eq('game_id', savedGameId)
            .eq('player_id', user.id)
            .single();

          if (!playerRow) {
            // User is not in this game — don't restore
            localStorage.removeItem(STORAGE_KEY_GAME);
            localStorage.removeItem(STORAGE_KEY_SCREEN);
            setScreen('lobby');
            return;
          }

          const phase = gameData.phase as string;
          const restoredScreen: AppScreen =
            phase === 'lobby' || phase === 'waiting' ? 'waiting' : 'game';
          setActiveGameId(savedGameId);
          setScreen(restoredScreen);
          localStorage.setItem(STORAGE_KEY_SCREEN, restoredScreen);
          loadGameState(savedGameId);
        });
    } else {
      setScreen('lobby');
    }
  }, [authLoading, user, restored]);

  // ── Realtime subscription ────────────────────────────────────
  useEffect(() => {
    if (!activeGameId) return;
    const unsub = subscribeToGame(activeGameId);
    return unsub;
  }, [activeGameId]);

  // ── Keep screen in sync ──────────────────────────────────────
  useEffect(() => {
    if (screen === 'waiting' || screen === 'game') {
      localStorage.setItem(STORAGE_KEY_SCREEN, screen);
    }
  }, [screen]);

  // ── Splash ───────────────────────────────────────────────────
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
      <Suspense fallback={
        <div className="splash-screen">
          <div className="splash-spinner" />
        </div>
      }>
        {screen === 'auth' && <AuthScreen />}

        {screen === 'lobby' && (
          <Lobby
            onGameJoined={(gameId) => goTo('waiting', gameId)}
            onAccount={() => goTo('account')}
          />
        )}

        {screen === 'account' && (
          <AccountPage onBack={() => setScreen('lobby')} />
        )}

        {screen === 'waiting' && activeGameId && (
          <WaitingRoom
            gameId={activeGameId}
            onGameStart={() => goTo('game', activeGameId)}
            onLeave={handleLeave}
          />
        )}

        {screen === 'game' && activeGameId && (
          <MPGameTable
            gameId={activeGameId}
            onLeave={handleLeave}
          />
        )}
      </Suspense>
    </div>
  );
};

export default App;