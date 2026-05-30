import { Card } from '../types/game';

export const CARD_VALUES = {
  ACE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
  SEVEN: 7,
  EIGHT: 8,
  NINE: 9,
  TEN: 10,
  JACK: 11,
  QUEEN: 12,
  KING: 13
} as const;

export const getCardDisplay = (value: number): string => {
  switch (value) {
    case 1: return 'A';
    case 11: return 'J';
    case 12: return 'Q';
    case 13: return 'K';
    default: return value.toString();
  }
};

export const getSuitSymbol = (suit: string): string => {
  switch (suit) {
    case 'hearts': return '♥';
    case 'diamonds': return '♦';
    case 'clubs': return '♣';
    case 'spades': return '♠';
    default: return '';
  }
};

export const isRedSuit = (suit: string): boolean => {
  return suit === 'hearts' || suit === 'diamonds';
};

export const isSpecialCard = (value: number): boolean => {
  return value >= 6;
};

export const getCardSpecialAbility = (value: number): string => {
  if (!isSpecialCard(value)) return 'Standard Card';

  switch (value) {
    case 6:
    case 7:
      return 'Peek at one of your cards';
    case 8:
    case 9:
      return 'Spy on one opponent card';
    case 10:
    case 11:
      return 'Blind swap with opponent';
    case 12:
    case 13:
      return 'Informed swap (see both cards)';
    default:
      return 'Special Card';
  }
};

export const createDeck = (numberOfDecks: number = 1): Card[] => {
  const suits: ('hearts' | 'diamonds' | 'clubs' | 'spades')[] = [
    'hearts', 'diamonds', 'clubs', 'spades'
  ];
  const deck: Card[] = [];

  for (let d = 0; d < numberOfDecks; d++) {
    suits.forEach(suit => {
      for (let value = 1; value <= 13; value++) {
        deck.push({
          id: `${suit}-${value}-${d}`,
          value,
          suit,
          faceUp: false
        });
      }
    });
  }

  return shuffleDeck(deck);
};

export const shuffleDeck = (deck: Card[]): Card[] => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};