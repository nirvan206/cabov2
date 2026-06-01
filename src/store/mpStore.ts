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
  channel: any | null;
  firstSel: { seat: number, idx: number } | null;
  secondSel: { seat: number, idx: number } | null;
  swapAnimEvent: { seat1: number, idx1: number, seat2: number, idx2: number, timestamp: number } | null;

  // Actions
  createGame: (maxPlayers: number, numDecks?: number) => Promise<string | null>;
  joinGame: (gameId: string) => Promise<boolean>;
  leaveGame: () => Promise<void>;
  startGame: () => Promise<void>;
  setReady: () => Promise<void>;
  drawCard: () => Promise<void>;
  keepCard: () => Promise<void>;
  swapDrawn: (handIndex: number) => Promise<void>;
  peekCard: (cardIndex: number) => Promise<any>;
  spyCard: (targetSeat: number, cardIndex: number) => Promise<any>;
  blindSwap: (myIndex: number, targetSeat: number, targetIndex: number) => Promise<void>;
  swapWithPeek: (myIndex: number, targetSeat: number, targetIndex: number, phase?: 'reveal' | 'swap') => Promise<any>;
  callCabo: () => Promise<void>;
  nextRound: () => Promise<void>;
  endPeeking: () => Promise<void>;

  // Realtime
  subscribeToGame: (gameId: string) => () => void;
  loadGameState: (gameId: string) => Promise<void>;
  setMySeat: (seat: number) => void;
  clearGame: () => void;
  setError: (e: string | null) => void;
}

const invoke = async (fn: string, body: object) => {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    // Extract the real error message from the function response body
    try {
      const errBody = await (error as any).context?.json?.();
      if (errBody?.error) throw new Error(errBody.error);
    } catch (inner: any) {
      if (inner?.message && inner.message !== error.message) throw inner;
    }
    throw new Error(error.message);
  }
  return data;
};

let currentAccessToken: string | null = null;
supabase.auth.onAuthStateChange((_event, session) => {
  currentAccessToken = session?.access_token ?? null;
});

export const useMPStore = create<MPStore>((set, get) => ({
  game: null,
  players: [],
  cards: [],
  actionLog: [],
  drawnCard: null,
  loading: false,
  error: null,
  mySeat: null,
  channel: null,
  firstSel: null,
  secondSel: null,
  swapAnimEvent: null,

  setError: (e) => set({ error: e }),
  setMySeat: (seat) => set({ mySeat: seat }),
  clearGame: () => set({
    game: null,
    players: [],
    cards: [],
    actionLog: [],
    drawnCard: null,
    mySeat: null,
    channel: null,
    firstSel: null,
    secondSel: null,
    swapAnimEvent: null
  }),

  // ── Create Game ────────────────────────────────────────────
  createGame: async (maxPlayers, numDecks = 2) => {
    set({ loading: true, error: null });
    try {
      const data = await invoke('game-management', { type: 'create-game', max_players: maxPlayers, num_decks: numDecks });
      set({ loading: false, mySeat: data.seat_index ?? 0 });
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
      const data = await invoke('game-management', { type: 'join-game', game_id: gameId });
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
      await invoke('game-management', { type: 'leave-game', game_id: game.id });
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
      await invoke('game-management', { type: 'set-ready', game_id: game.id });
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
      await invoke('game-flow', { type: 'start-game', game_id: game.id });
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
      const data = await invoke('game-actions', { type: 'draw', game_id: game.id });
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
      await invoke('game-actions', { type: 'keep-discard', game_id: game.id });
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
      await invoke('game-actions', { type: 'swap-drawn', game_id: game.id, hand_index: handIndex });
      set({ drawnCard: null });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ── Peek own card ───────────────────────────────────────────
  peekCard: async (cardIndex) => {
    const { game } = get();
    if (!game) return null;
    try {
      return await invoke('game-actions', { type: 'peek', game_id: game.id, card_index: cardIndex });
    } catch (e: any) {
      set({ error: e.message });
      return null;
    }
  },

  // ── Spy opponent card ───────────────────────────────────────
  spyCard: async (targetSeat, cardIndex) => {
    const { game } = get();
    if (!game) return null;
    try {
      return await invoke('game-actions', { type: 'spy', game_id: game.id, target_seat: targetSeat, card_index: cardIndex });
    } catch (e: any) {
      set({ error: e.message });
      return null;
    }
  },

  // ── Blind Swap ──────────────────────────────────────────────
  blindSwap: async (myIndex, targetSeat, targetIndex) => {
    const { game } = get();
    if (!game) return;
    try {
      await invoke('game-actions', { type: 'blind-swap', game_id: game.id, my_index: myIndex, target_seat: targetSeat, target_index: targetIndex });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ── Swap With Peek (Q/K) ────────────────────────────────────
  swapWithPeek: async (myIndex, targetSeat, targetIndex, phase: 'reveal' | 'swap' = 'swap') => {
    const { game } = get();
    if (!game) return null;
    try {
      const data = await invoke('game-actions', { type: 'swap-with-peek', game_id: game.id, my_index: myIndex, target_seat: targetSeat, target_index: targetIndex, phase });
      return data;
    } catch (e: any) {
      set({ error: e.message });
      return null;
    }
  },

  // ── Call Cabo ───────────────────────────────────────────────
  callCabo: async () => {
    const { game } = get();
    if (!game) return;
    try {
      await invoke('game-actions', { type: 'call-cabo', game_id: game.id });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ── Next Round ──────────────────────────────────────────────
  nextRound: async () => {
    const { game } = get();
    if (!game) return;
    try {
      await invoke('game-flow', { type: 'next-round', game_id: game.id });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  endPeeking: async () => {
    const { game } = get();
    if (!game) return;
    try {
      await invoke('game-actions', { type: 'end-peeking', game_id: game.id });
    } catch (e: any) {
      console.error(e);
    }
  },

  // ── Load Full State ─────────────────────────────────────────
  loadGameState: async (gameId) => {
    try {
      const data = await invoke('game-flow', { type: 'get-state', game_id: gameId });
      set({
        game: data.game,
        players: data.players,
        cards: data.cards,
        actionLog: data.action_log?.map((l: any) => l.message) ?? [],
        // Sync seat if returned and not already set
        ...(data.my_seat >= 0 && { mySeat: data.my_seat }),
      });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ── Realtime Subscriptions ──────────────────────────────────
  subscribeToGame: (gameId) => {
    const channelId = `game_room:${gameId}`;
    let hostDisconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cardUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
    let playerUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleUnload = () => {
      const mySeat = get().mySeat;
      const g = get().game;
      if (!g || g.status === 'finished') return;
      const url = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/game-management';
      if (mySeat === 0) {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'terminate-game', game_id: gameId }),
          keepalive: true
        });
      } else if (mySeat !== null && mySeat > 0 && currentAccessToken) {
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentAccessToken}`
          },
          body: JSON.stringify({ type: 'leave-game', game_id: gameId }),
          keepalive: true
        });
      }
    };
    window.addEventListener('beforeunload', handleUnload);

    let cardUpdateQueue: { eventType: string; newRow: any; oldRow: any }[] = [];
    let playerUpdateQueue: { eventType: string; newRow: any; oldRow: any }[] = [];

    const processCardQueue = () => {
      const mySeat = get().mySeat;
      const maskCard = (c: any) => {
        const isOwnCard = mySeat !== null && mySeat >= 0 && c.owner_seat === mySeat && c.location === 'hand';
        const reveal = isOwnCard || c.face_up;
        return {
          ...c,
          value: reveal ? c.value : null,
          suit: reveal ? c.suit : null
        };
      };

      set((state) => {
        const cardMap = new Map<string, MPCard>(state.cards.map(c => [c.id, c]));
        cardUpdateQueue.forEach(({ eventType, newRow, oldRow }) => {
          if (eventType === 'INSERT') {
            cardMap.set(newRow.id, maskCard(newRow));
          } else if (eventType === 'UPDATE') {
            cardMap.set(newRow.id, maskCard(newRow));
          } else if (eventType === 'DELETE') {
            cardMap.delete(oldRow.id);
          }
        });
        cardUpdateQueue = [];
        return { cards: Array.from(cardMap.values()) };
      });
    };

    const processPlayerQueue = () => {
      set((state) => {
        const playerMap = new Map<string, MPPlayer>(state.players.map(p => [p.id, p]));
        let needsFullFetch = false;

        playerUpdateQueue.forEach(({ eventType, newRow, oldRow }) => {
          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const existing = playerMap.get(newRow.id);
            if (existing) {
              playerMap.set(newRow.id, { ...existing, ...newRow });
            } else {
              needsFullFetch = true;
            }
          } else if (eventType === 'DELETE') {
            playerMap.delete(oldRow.id);
          }
        });

        playerUpdateQueue = [];

        if (needsFullFetch) {
          setTimeout(() => { get().loadGameState(gameId); }, 0);
        }

        return { players: Array.from(playerMap.values()) };
      });
    };

    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          set({ game: payload.new as MPGame });
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;
          playerUpdateQueue.push({ eventType, newRow, oldRow });
          if (playerUpdateTimeout) clearTimeout(playerUpdateTimeout);
          playerUpdateTimeout = setTimeout(processPlayerQueue, 16);
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;
          cardUpdateQueue.push({ eventType, newRow, oldRow });
          if (cardUpdateTimeout) clearTimeout(cardUpdateTimeout);
          cardUpdateTimeout = setTimeout(processCardQueue, 16);
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'action_log', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const msg = (payload.new as any).message;
          set(s => ({ actionLog: [...s.actionLog.slice(-9), msg] }));
        })
      .on('broadcast', { event: 'card-highlight' }, (payload) => {
        const { seat, idx, type } = payload.payload;
        if (type === 'clear') {
          set({ firstSel: null, secondSel: null });
        } else if (type === 'first') {
          set({ firstSel: { seat, idx } });
        } else if (type === 'second') {
          set({ secondSel: { seat, idx } });
        }
      })
      .on('broadcast', { event: 'swap-anim' }, (payload) => {
        const { seat1, idx1, seat2, idx2 } = payload.payload;
        set({ swapAnimEvent: { seat1, idx1, seat2, idx2, timestamp: Date.now() } });
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        let hostPresent = false;
        
        for (const id in state) {
          for (const presence of state[id] as any[]) {
            if (presence.seat === 0) hostPresent = true;
          }
        }

        if (hostPresent) {
          if (hostDisconnectTimer) {
            clearTimeout(hostDisconnectTimer);
            hostDisconnectTimer = null;
          }
        } else {
          // Host is missing. Start a 5-second grace timer.
          if (!hostDisconnectTimer) {
            hostDisconnectTimer = setTimeout(() => {
              const mySeat = get().mySeat;
              const g = get().game;
              if (mySeat !== null && mySeat > 0 && g && g.status !== 'finished') {
                const url = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/game-management';
                fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: 'terminate-game', game_id: gameId }),
                }).catch(console.error);
              }
            }, 5000);
          }
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await get().loadGameState(gameId);
          const mySeat = get().mySeat;
          if (mySeat !== null) {
            await channel.track({ seat: mySeat });
          }
        }
      });

    set({ channel });

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      if (hostDisconnectTimer) clearTimeout(hostDisconnectTimer);
      if (cardUpdateTimeout) clearTimeout(cardUpdateTimeout);
      if (playerUpdateTimeout) clearTimeout(playerUpdateTimeout);
      supabase.removeChannel(channel);
      set({ channel: null, firstSel: null, secondSel: null, swapAnimEvent: null });
    };
  },
}));
