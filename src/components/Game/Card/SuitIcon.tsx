import React from 'react';

interface SuitIconProps {
  suit: string;
  className?: string;
}

export const SuitIcon: React.FC<SuitIconProps> = ({ suit, className = 'w-4 h-4' }) => {
  switch (suit.toLowerCase()) {
    case 'spades':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M12 2C11.5 2 8 6.5 8 11.2c0 2.6 1.8 4 1.8 4s.7-1.2 2.2-1.2 2.2 1.2 2.2 1.2 1.8-1.4 1.8-4c0-4.7-3.5-9.2-4-9.2zm0 12.5c.5 0 2 2 2 5s-1 4-2 4-2-1-2-4 1.5-5 2-5z" />
        </svg>
      );
    case 'hearts':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      );
    case 'diamonds':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M12 2L3.5 12L12 22L20.5 12L12 2z" />
        </svg>
      );
    case 'clubs':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          {/* Detailed club with 3 circular lobes and a stem */}
          <path d="M12 8.5a3.5 3.5 0 1 0-3.5-3.5c0 .33.05.65.13.95A4 4 0 1 0 5 12c0 .35.05.7.13 1.03A3.5 3.5 0 1 0 11 16.5c0-.13 0-.26-.02-.38a4 4 0 1 0 2.04 0c-.02.12-.02.25-.02.38a3.5 3.5 0 1 0 5.87-3.47c.08-.33.13-.68.13-1.03a4 4 0 1 0-3.63-6.05c.08-.3.13-.62.13-.95A3.5 3.5 0 0 0 12 8.5z" />
          <path d="M12 14c.5 0 2 2 2 5s-1 4-2 4-2-1-2-4 1.5-5 2-5z" />
        </svg>
      );
    default:
      return null;
  }
};
