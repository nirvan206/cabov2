import React from 'react';
import { MPCard } from '../../store/mpStore';
import { Card } from './Card/Card';

interface ActionModalProps {
  isOpen: boolean;
  drawnCard: MPCard | null;
  onUseAbility: () => void;
  onSwap: () => void;
  onDiscard: () => void;
}

export const ActionModal: React.FC<ActionModalProps> = ({
  isOpen,
  drawnCard,
  onUseAbility,
  onSwap,
  onDiscard
}) => {
  if (!isOpen || !drawnCard) return null;

  const val = drawnCard.value ?? 0;
  let abilityName = '';
  if (val === 6 || val === 7) abilityName = '👁 Self Peek';
  else if (val === 8 || val === 9) abilityName = '🕵️ Spy Opponent';
  else if (val === 10 || val === 11) abilityName = '🔀 Blind Swap';
  else if (val >= 12) abilityName = '🔀 Seen Swap';

  return (
    <div className="action-overlay animate-fade-in">
      <div className="action-panel">
        <div className="action-title">YOU DREW</div>
        <div className="action-card-preview">
          <Card card={drawnCard} faceDown={false} size="md" />
        </div>
        {abilityName && (
          <div className="action-ability">
            This card has the special ability: <strong>{abilityName}</strong>
          </div>
        )}
        <div className="action-buttons">
          {abilityName && (
            <button className="btn btn-amber w-full" onClick={onUseAbility}>
              Use Ability
            </button>
          )}
          <button className="btn btn-blue w-full" onClick={onSwap}>
            Swap with Hand Card
          </button>
          <button className="btn btn-ghost w-full" onClick={onDiscard}>
            🗑 Discard Card
          </button>
        </div>
      </div>
    </div>
  );
};
