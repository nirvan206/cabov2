import { create } from 'zustand';
import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────
export interface MPCard {
  id: string;
  value: number | null; // null = hidden (anti-cheat)
  suit: string | null;
  location: string;
  hand_index: number | null;
  face_up: boolean;
  owner_seat: number | null;
}

export interface MPPlayer {
  id: string;
  player_id: string;
  seat_index: number;
  total_score: number;
  round_scores: number[];
  is_ready: boolean;
  username: string;
  avatar_url: string | null;
}

export interface MPGame {
  id: string;
  status: string;
  phase: string;
  current_round: number;
  current_turn_seat: number;
  cabo_called: boolean;
  cabo_caller_seat: number | null;
  max_players: number;
}

export type GameAction = 'draw' | 'keep' | 'swap' | 'peek' | 'spy' | 'blind-swap' | 'swap-peek' | 'cabo';

interface MPStore {
  game: MPGame | null;
  players: MPPlayer[];
  cards: MPCard[];
  actionLog: string[];
  drawnCard: MPCard | null;
  loading: boolean;
  error: string | null;
  mySeat: number | null;

  // Actions
  createGame: (maxPlayers: number, numDecks?: number) => Promise<string | null>;
  joinGame: (gameId: string) => Promise<boolean>;
  leaveGame: () => Promise<void>;
  startGame: () => Promise<void>;
  setReady: () => Promise<void>;
  drawCard: () => Promise<void>;
  keepCard: () => Promise<void>;
  swapDrawn: (handIndex: number) => Promise<void>;
  peekCard: (cardIndex: number) => Promise<void>;
  spyCard: (targetSeat: number, cardIndex: number) => Promise<void>;
  blindSwap: (myIndex: number, targetSeat: number, targetIndex: number) => Promise<void>;
  swapWithPeek: (myIndex: number, targetSeat: number, targetIndex: number) => Promise<void>;
  callCabo: () => Promise<void>;
  nextRound: () => Promise<void>;

  // Realtime
  subscribeToGame: (gameId: string) => () => void;
  loadGameState: (gameId: string) => Promise<void>;
  setMySeat: (seat: number) => void;
  clearGame: () => void;
  setError: (e: string | null) => void;
}

const invoke = async (fn: string, body: object) => {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message);
  return data;
};

export const useMPStore = create<MPStore>((set, get) => ({
  game: null,
  players: [],
  cards: [],
  actionLog: [],
  drawnCard: null,
  loading: false,
  error: null,
  mySeat: null,

  setError: (e) => set({ error: e }),
  setMySeat: (seat) => set({ mySeat: seat }),
  clearGame: () => set({ game: null, players: [], cards: [], actionLog: [], drawnCard: null, mySeat: null }),

  // ── Create Game ────────────────────────────────────────────
  createGame: async (maxPlayers, numDecks = 2) => {
    set({ loading: true, error: null });
    try {
      const data = await invoke('create-game', { max_players: maxPlayers, num_decks: numDecks });
      set({ loading: false });
      return data.game_id as string;
    } catch (e: any) {
      set({ loading: false, error: e.message });
      return null;
    }
  },

  // ── Join Game ──────────────────────────────────────────────
  joinGame: async (gameId) => {
    set({ loading: true, error: null });
    try {
      const data = await invoke('join-game', { game_id: gameId });
      set({ mySeat: data.seat_index, loading: false });
      return true;
    } catch (e: any) {
      set({ loading: false, error: e.message });
      return false;
    }
  },

  // ── Leave Game ─────────────────────────────────────────────
  leaveGame: async () => {
    const { game } = get();
    if (!game) return;
    try {
      await invoke('leave-game', { game_id: game.id });
      get().clearGame();
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ── Set Ready ──────────────────────────────────────────────
  setReady: async () => {
    const { game } = get();
    if (!game) return;
    try {
      await invoke('set-ready', { game_id: game.id });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ── Start Game ─────────────────────────────────────────────
  startGame: async () => {
    const { game } = get();
    if (!game) return;
    set({ loading: true });
    try {
      await invoke('start-game', { game_id: game.id });
      set({ loading: false });
    } catch (e: any) {
      set({ loading: false, error: e.message });
    }
  },

  // ── Draw Card ──────────────────────────────────────────────
  drawCard: async () => {
    const { game } = get();
    if (!game) return;
    try {
      const data = await invoke('draw', { game_id: game.id });
      set({ drawnCard: data.card });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ── Keep (discard drawn) ────────────────────────────────────
  keepCard: async () => {
    const { game } = get();
    if (!game) return;
    try {
      await invoke('keep-discard', { game_id: game.id });
      set({ drawnCard: null });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ── Swap Drawn with Hand ────────────────────────────────────
  swapDrawn: async (handIndex) => {
    const { game } = get();
    if (!game) return;
    try {
      await invoke('swap-drawn', { game_id: game.id, hand_index: handIndex });
      set({ drawnCard: null });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ── Peek own card ───────────────────────────────────────────
  peekCard: async (cardIndex) => {
    const { game } = get();
    if (!game) return;
    try {
      await invoke('peek', { game_id: game.id, card_index: cardIndex });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ── Spy opponent card ───────────────────────────────────────
  spyCard: async (targetSeat, cardIndex) => {
    const { game } = get();
    if (!game) return;
    try {
      await invoke('spy', { game_id: game.id, target_seat: targetSeat, card_index: cardIndex });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ── Blind Swap ──────────────────────────────────────────────
  blindSwap: async (myIndex, targetSeat, targetIndex) => {
    const { game } = get();
    if (!game) return;
    try {
      await invoke('blind-swap', { game_id: game.id, my_index: myIndex, target_seat: targetSeat, target_index: targetIndex });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ── Swap With Peek (Q/K) ────────────────────────────────────
  swapWithPeek: async (myIndex, targetSeat, targetIndex) => {
    const { game } = get();
    if (!game) return;
    try {
      await invoke('swap-with-peek', { game_id: game.id, my_index: myIndex, target_seat: targetSeat, target_index: targetIndex });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ── Call Cabo ───────────────────────────────────────────────
  callCabo: async () => {
    const { game } = get();
    if (!game) return;
    try {
      await invoke('call-cabo', { game_id: game.id });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ── Next Round ──────────────────────────────────────────────
  nextRound: async () => {
    const { game } = get();
    if (!game) return;
    try {
      await invoke('next-round', { game_id: game.id });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ── Load Full State ─────────────────────────────────────────
  loadGameState: async (gameId) => {
    try {
      const data = await invoke('get-state', { game_id: gameId });
      set({
        game: data.game,
        players: data.players,
        cards: data.cards,
        actionLog: data.action_log?.map((l: any) => l.message) ?? [],
      });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ── Realtime Subscriptions ──────────────────────────────────
  subscribeToGame: (gameId) => {
    const channel = supabase
      .channel(`game:${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          set({ game: payload.new as MPGame });
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        () => { get().loadGameState(gameId); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards', filter: `game_id=eq.${gameId}` },
        () => { get().loadGameState(gameId); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'action_log', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const msg = (payload.new as any).message;
          set(s => ({ actionLog: [...s.actionLog.slice(-9), msg] }));
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  },
}));
