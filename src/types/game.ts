export interface Card {
  id: string;
  value: number;
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  faceUp: boolean;
}

export interface Player {
  id: string;
  name: string;
  cards: Card[];
  totalScore: number;
  roundScores: number[];
  isCurrentPlayer: boolean;
}

export interface GameState {
  players: Player[];
  deck: Card[];
  discardFaceUp: Card[];
  discardFaceDown: Card[];
  currentRound: number;
  currentPlayerIndex: number;
  selectedCardIndex: number | null;
  drawnCard: Card | null;
  actionType: 'useSpecial' | 'discard' | null;
  gamePhase: 'setup' | 'dealing' | 'peeking' | 'playing' | 'roundEnd' | 'gameEnd';
  caboCalled: boolean;
  caboPlayerId: string | null;
  peekTimeRemaining: number;
  actionLog: string[];
}

export interface CardAction {
  type: 'draw' | 'useSpecial' | 'discard' | 'swap' | 'peek';
  card?: Card;
  targetPlayerId?: string;
  targetCardIndex?: number;
}