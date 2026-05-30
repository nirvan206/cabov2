import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { GameState, Player, Card } from '../types/game';
import { createDeck, shuffleDeck } from '../utils/cardUtils';

interface GameStore extends GameState {
  // Setup
  setupGame: (numberOfPlayers: number, numberOfDecks: number) => void;

  // Game flow
  dealInitialCards: () => void;
  endPeekPhase: () => void;
  drawCard: () => Card | undefined;
  handleDrawnCardAction: (action: 'useSpecial' | 'swap' | 'keep') => void;
  confirmSwap: (cardIndex?: number) => void;
  advanceTurn: () => void;
  callCabo: () => void;
  endRound: () => void;
  nextRound: () => void;
  resetGame: () => void;

  // Card actions
  selectCard: (cardIndex: number) => void;
  setSelectedCard: (index: number | null) => void;
  setActionType: (type: 'useSpecial' | 'discard' | null) => void;
  peekAtCard: (cardIndex: number) => void;
  unpeekCard: (cardIndex: number) => void;
  spyOpponentCard: (playerId: string, cardIndex: number) => void;
  unspyCard: (playerId: string, cardIndex: number) => void;
  executeBlindSwap: (playerId: string, yourCardIndex: number, opponentCardIndex: number) => void;
  swapWithOpponent: (playerId: string, yourCardIndex: number, opponentCardIndex: number) => void;
  completeSpecialAction: () => void;
  refreshDeck: () => void;

  // Log
  addLog: (msg: string) => void;

  // AI
  executeAITurn: () => void;
}

const initialGameState: GameState = {
  players: [],
  deck: [],
  discardFaceUp: [],
  discardFaceDown: [],
  currentRound: 1,
  currentPlayerIndex: 0,
  selectedCardIndex: null,
  drawnCard: null,
  actionType: null,
  gamePhase: 'setup',
  caboCalled: false,
  caboPlayerId: null,
  peekTimeRemaining: 0,
  actionLog: [],
};

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialGameState,

    // ── Reset to setup ────────────────────────────────────────
    resetGame: () => {
      set({ ...initialGameState });
    },

    // ── Log ────────────────────────────────────────────────────
    addLog: (msg: string) => {
      const { actionLog } = get();
      set({ actionLog: [...actionLog.slice(-9), msg] });
    },

    // ── Setup ──────────────────────────────────────────────────
    setupGame: (numberOfPlayers: number, numberOfDecks: number) => {
      const deck = createDeck(numberOfDecks);
      const players: Player[] = Array.from({ length: numberOfPlayers }, (_, i) => ({
        id: `player-${i + 1}`,
        name: i === 0 ? 'You' : `Player ${i + 1}`,
        cards: [],
        totalScore: 0,
        roundScores: [],
        isCurrentPlayer: i === 0,
      }));

      set({
        ...initialGameState,
        players,
        deck,
        gamePhase: 'dealing',
      });
    },

    // ── Dealing ───────────────────────────────────────────────
    dealInitialCards: () => {
      const { players, deck } = get();
      const remainingDeck = [...deck];
      const updatedPlayers = players.map(p => ({ ...p, cards: [] as Card[] }));

      for (let i = 0; i < 4; i++) {
        updatedPlayers.forEach(player => {
          if (remainingDeck.length > 0) {
            const card = { ...remainingDeck.pop()!, faceUp: false };
            player.cards.push(card);
          }
        });
      }

      set({
        players: updatedPlayers,
        deck: remainingDeck,
        gamePhase: 'peeking',
        peekTimeRemaining: 5,
      });

      get().addLog('Cards dealt — memorize your bottom cards!');
    },

    // ── Peek Phase ────────────────────────────────────────────
    endPeekPhase: () => {
      const { players } = get();
      const updated = players.map(p => ({
        ...p,
        cards: p.cards.map(c => ({ ...c, faceUp: false })),
      }));
      set({ players: updated, gamePhase: 'playing', peekTimeRemaining: 0 });
      get().addLog('Your turn — draw from the deck');
    },

    // ── Draw Card ─────────────────────────────────────────────
    drawCard: () => {
      const { deck } = get();
      if (deck.length === 0) {
        get().refreshDeck();
        if (get().deck.length === 0) return undefined;
      }

      const state = get();
      const newCard = { ...state.deck[state.deck.length - 1], faceUp: true };
      const updatedDeck = state.deck.slice(0, -1);

      set({ deck: updatedDeck, drawnCard: newCard });
      return newCard;
    },

    // ── Handle Drawn Card Decision ────────────────────────────
    handleDrawnCardAction: (action: 'useSpecial' | 'swap' | 'keep') => {
      const { drawnCard } = get();
      if (!drawnCard) return;

      if (action === 'keep') {
        get().addLog('You discarded a card');
        set({
          discardFaceUp: [...get().discardFaceUp, drawnCard],
          drawnCard: null,
          actionType: null,
          selectedCardIndex: null,
        });
        get().advanceTurn();
        return;
      }

      if (action === 'swap') {
        set({ actionType: 'discard', selectedCardIndex: null });
        return;
      }

      if (action === 'useSpecial' && drawnCard.value >= 6) {
        set({ actionType: 'useSpecial', selectedCardIndex: null });
        return;
      }
    },

    // ── Confirm Swap (drawn card ↔ player card) ───────────────
    confirmSwap: (cardIndex?: number) => {
      const { drawnCard, players, currentPlayerIndex, selectedCardIndex, discardFaceDown } = get();
      const idx = cardIndex !== undefined ? cardIndex : selectedCardIndex;
      if (!drawnCard || idx === null || idx === undefined) return;

      const updatedPlayers = players.map(p => ({
        ...p,
        cards: p.cards.map(c => ({ ...c })),
      }));
      const currentPlayer = updatedPlayers[currentPlayerIndex];
      const playerCard = { ...currentPlayer.cards[idx] };

      currentPlayer.cards[idx] = { ...drawnCard, faceUp: false };

      set({
        players: updatedPlayers,
        discardFaceDown: [...discardFaceDown, playerCard],
        drawnCard: null,
        actionType: null,
        selectedCardIndex: null,
      });

      get().advanceTurn();
    },

    // ── Advance Turn ──────────────────────────────────────────
    advanceTurn: () => {
      const { players, currentPlayerIndex, caboCalled, caboPlayerId } = get();
      const nextIndex = (currentPlayerIndex + 1) % players.length;

      if (caboCalled && caboPlayerId) {
        const caboIndex = players.findIndex(p => p.id === caboPlayerId);
        if (nextIndex === caboIndex) {
          get().endRound();
          return;
        }
      }

      const updatedPlayers = players.map((p, i) => ({
        ...p,
        isCurrentPlayer: i === nextIndex,
      }));

      set({
        players: updatedPlayers,
        currentPlayerIndex: nextIndex,
        selectedCardIndex: null,
        actionType: null,
        drawnCard: null,
      });

      if (nextIndex === 0) {
        get().addLog('Your turn — draw from the deck');
      }
    },

    // ── Call Cabo ─────────────────────────────────────────────
    callCabo: () => {
      const { currentPlayerIndex, players } = get();
      get().addLog(`${players[currentPlayerIndex].name} called Cabo!`);
      set({
        caboCalled: true,
        caboPlayerId: players[currentPlayerIndex].id,
      });
      get().advanceTurn();
    },

    // ── End Round ─────────────────────────────────────────────
    endRound: () => {
      const { players, currentRound } = get();

      const updatedPlayers = players.map(p => ({
        ...p,
        cards: p.cards.map(c => ({ ...c, faceUp: true })),
      }));

      updatedPlayers.forEach(player => {
        const roundScore = player.cards.reduce((sum, card) => sum + card.value, 0);
        player.totalScore += roundScore;
        player.roundScores.push(roundScore);
      });

      const isGameEnd = currentRound >= 10;
      set({
        players: updatedPlayers,
        gamePhase: isGameEnd ? 'gameEnd' : 'roundEnd',
        drawnCard: null,
        actionType: null,
        selectedCardIndex: null,
        caboCalled: false,
        caboPlayerId: null,
      });

      const sorted = [...updatedPlayers].sort((a, b) =>
        a.roundScores[a.roundScores.length - 1] - b.roundScores[b.roundScores.length - 1]
      );
      get().addLog(`Round ${currentRound} ended — ${sorted[0].name} wins!`);
    },

    // ── Next Round ────────────────────────────────────────────
    nextRound: () => {
      const { currentRound, players } = get();
      const newRound = currentRound + 1;

      if (newRound > 10) {
        set({ gamePhase: 'gameEnd' });
        return;
      }

      const lastScores = players.map((p, i) => ({
        index: i,
        score: p.roundScores.length > 0 ? p.roundScores[p.roundScores.length - 1] : Infinity,
      }));
      const winnerIdx = lastScores.reduce((min, cur) =>
        cur.score < min.score ? cur : min
      ).index;

      const deck = createDeck(2);
      const updatedPlayers = players.map((p, i) => ({
        ...p,
        cards: [],
        isCurrentPlayer: i === winnerIdx,
      }));

      set({
        players: updatedPlayers,
        deck,
        currentRound: newRound,
        currentPlayerIndex: winnerIdx,
        gamePhase: 'dealing',
        caboCalled: false,
        caboPlayerId: null,
        selectedCardIndex: null,
        drawnCard: null,
        actionType: null,
        discardFaceUp: [],
        discardFaceDown: [],
        peekTimeRemaining: 0,
        actionLog: [],
      });

      get().addLog(`Round ${newRound} starting!`);
      get().dealInitialCards();
    },

    // ── Card Selection ────────────────────────────────────────
    selectCard: (cardIndex: number) => {
      set({
        selectedCardIndex: cardIndex === get().selectedCardIndex ? null : cardIndex,
      });
    },

    setSelectedCard: (index: number | null) => {
      set({ selectedCardIndex: index });
    },

    setActionType: (type: 'useSpecial' | 'discard' | null) => {
      set({ actionType: type, selectedCardIndex: null });
    },

    // ── Peek / Spy ────────────────────────────────────────────
    peekAtCard: (cardIndex: number) => {
      const { players, currentPlayerIndex } = get();
      const updatedPlayers = players.map(p => ({ ...p, cards: p.cards.map(c => ({ ...c })) }));
      const player = updatedPlayers[currentPlayerIndex];
      if (player?.cards[cardIndex]) {
        player.cards[cardIndex].faceUp = true;
        set({ players: updatedPlayers });
      }
    },

    unpeekCard: (cardIndex: number) => {
      const { players, currentPlayerIndex } = get();
      const updatedPlayers = players.map(p => ({ ...p, cards: p.cards.map(c => ({ ...c })) }));
      const player = updatedPlayers[currentPlayerIndex];
      if (player?.cards[cardIndex]) {
        player.cards[cardIndex].faceUp = false;
        set({ players: updatedPlayers });
      }
    },

    spyOpponentCard: (playerId: string, cardIndex: number) => {
      const { players } = get();
      const updatedPlayers = players.map(p => {
        if (p.id === playerId) {
          return {
            ...p,
            cards: p.cards.map((c, i) => i === cardIndex ? { ...c, faceUp: true } : c),
          };
        }
        return { ...p, cards: p.cards.map(c => ({ ...c })) };
      });
      set({ players: updatedPlayers });
    },

    unspyCard: (playerId: string, cardIndex: number) => {
      const { players } = get();
      const updatedPlayers = players.map(p => {
        if (p.id === playerId) {
          return {
            ...p,
            cards: p.cards.map((c, i) => i === cardIndex ? { ...c, faceUp: false } : c),
          };
        }
        return { ...p, cards: p.cards.map(c => ({ ...c })) };
      });
      set({ players: updatedPlayers });
    },

    // ── Swap Actions ──────────────────────────────────────────
    executeBlindSwap: (playerId: string, yourCardIndex: number, opponentCardIndex: number) => {
      const { players, currentPlayerIndex } = get();
      const updatedPlayers = players.map(p => ({ ...p, cards: p.cards.map(c => ({ ...c })) }));
      const current = updatedPlayers[currentPlayerIndex];
      const opponent = updatedPlayers.find(p => p.id === playerId)!;

      const temp = { ...current.cards[yourCardIndex] };
      current.cards[yourCardIndex] = { ...opponent.cards[opponentCardIndex], faceUp: false };
      opponent.cards[opponentCardIndex] = { ...temp, faceUp: false };

      set({ players: updatedPlayers });
    },

    swapWithOpponent: (playerId: string, yourCardIndex: number, opponentCardIndex: number) => {
      const { players, currentPlayerIndex } = get();
      const updatedPlayers = players.map(p => ({ ...p, cards: p.cards.map(c => ({ ...c })) }));
      const current = updatedPlayers[currentPlayerIndex];
      const opponent = updatedPlayers.find(p => p.id === playerId)!;

      const temp = { ...current.cards[yourCardIndex] };
      current.cards[yourCardIndex] = { ...opponent.cards[opponentCardIndex], faceUp: false };
      opponent.cards[opponentCardIndex] = { ...temp, faceUp: false };

      set({ players: updatedPlayers });
    },

    // ── Complete Special Action ───────────────────────────────
    completeSpecialAction: () => {
      const { drawnCard, discardFaceUp } = get();
      if (drawnCard) {
        set({
          discardFaceUp: [...discardFaceUp, drawnCard],
          drawnCard: null,
          actionType: null,
          selectedCardIndex: null,
        });
      } else {
        set({ actionType: null, selectedCardIndex: null });
      }
      get().advanceTurn();
    },

    // ── Refresh Deck ──────────────────────────────────────────
    refreshDeck: () => {
      const { discardFaceUp, discardFaceDown, players } = get();
      const allDiscarded = [...discardFaceUp, ...discardFaceDown];
      const playerCardIds = new Set(players.flatMap(p => p.cards.map(c => c.id)));
      const newDeck = shuffleDeck(
        allDiscarded.filter(card => !playerCardIds.has(card.id))
      );
      set({ deck: newDeck, discardFaceUp: [], discardFaceDown: [] });
    },

    // ── AI Turn ───────────────────────────────────────────────
    executeAITurn: () => {
      const state = get();
      if (state.gamePhase !== 'playing') return;
      if (state.currentPlayerIndex === 0) return;

      const currentPlayer = state.players[state.currentPlayerIndex];

      const card = get().drawCard();
      if (!card) return;

      const faceDownIndices = currentPlayer.cards
        .map((c, i) => ({ card: c, index: i }))
        .filter(({ card: c }) => !c.faceUp);

      const isSpecial = card.value >= 6;

      if (!isSpecial || Math.random() < 0.5) {
        if (card.value <= 5 && faceDownIndices.length > 0) {
          const swapIdx = faceDownIndices[Math.floor(Math.random() * faceDownIndices.length)].index;
          const updatedPlayers = get().players.map(p => ({ ...p, cards: p.cards.map(c => ({ ...c })) }));
          const aiPlayer = updatedPlayers[get().currentPlayerIndex];
          const playerCard = { ...aiPlayer.cards[swapIdx] };
          aiPlayer.cards[swapIdx] = { ...card, faceUp: false };

          set({
            players: updatedPlayers,
            discardFaceDown: [...get().discardFaceDown, playerCard],
            drawnCard: null,
          });
          get().addLog(`${currentPlayer.name} swapped a card`);
          get().advanceTurn();
        } else {
          set({
            discardFaceUp: [...get().discardFaceUp, card],
            drawnCard: null,
          });
          get().addLog(`${currentPlayer.name} discarded`);
          get().advanceTurn();
        }
      } else {
        if (card.value <= 9) {
          set({
            discardFaceUp: [...get().discardFaceUp, card],
            drawnCard: null,
          });
          get().addLog(`${currentPlayer.name} used a peek ability`);
          get().advanceTurn();
        } else {
          const opponents = state.players.filter((_, i) => i !== state.currentPlayerIndex);
          const opponent = opponents[Math.floor(Math.random() * opponents.length)];
          const myIdx = faceDownIndices.length > 0
            ? faceDownIndices[Math.floor(Math.random() * faceDownIndices.length)].index
            : 0;
          const oppIdx = Math.floor(Math.random() * opponent.cards.length);

          set({
            discardFaceUp: [...get().discardFaceUp, card],
            drawnCard: null,
          });

          get().executeBlindSwap(opponent.id, myIdx, oppIdx);
          get().addLog(`${currentPlayer.name} swapped cards with ${opponent.name}`);
          get().advanceTurn();
        }
      }
    },
  }))
);