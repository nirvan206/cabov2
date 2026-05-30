import React from 'react';
import { useGameStore } from '../../store/gameStore';
import { getCardDisplay, getSuitSymbol, getCardSpecialAbility, isSpecialCard, isRedSuit } from '../../utils/cardUtils';

export const ActionPanel: React.FC = () => {
  const {
    drawnCard,
    gamePhase,
    handleDrawnCardAction,
    actionType,
    setActionType,
    selectedCardIndex,
    currentPlayerIndex,
  } = useGameStore();

  // Only show for human player during playing phase
  if (gamePhase !== 'playing' || currentPlayerIndex !== 0) return null;

  // ── Draw decision: FULL BLOCKING overlay ──
  if (drawnCard && !actionType) {
    const red = isRedSuit(drawnCard.suit);
    const colorStyle = { color: red ? '#c41e3a' : '#1a1a2e' };

    return (
      <div className="action-overlay">
        <div className="action-panel animate-fade-in">
          <div className="action-title">You drew a card</div>
          <div className="action-card-preview">
            <div className="action-card-big" style={colorStyle}>
              {getCardDisplay(drawnCard.value)}{getSuitSymbol(drawnCard.suit)}
            </div>
          </div>
          <div className="action-ability">{getCardSpecialAbility(drawnCard.value)}</div>
          <div className="action-buttons">
            {isSpecialCard(drawnCard.value) && (
              <button
                className="btn btn-purple"
                onClick={() => handleDrawnCardAction('useSpecial')}
              >
                ✨ Use Ability
              </button>
            )}
            <button
              className="btn btn-blue"
              onClick={() => handleDrawnCardAction('swap')}
            >
              🔄 Swap Card
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => handleDrawnCardAction('keep')}
            >
              🗑 Discard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Swap mode: NON-BLOCKING hint bar ──
  if (actionType === 'discard' && drawnCard) {
    const red = isRedSuit(drawnCard.suit);

    return (
      <div className="action-hint-bar animate-fade-in">
        <span>🔄 Tap one of your cards to swap with</span>
        <span className={`drawn-card-badge ${red ? 'suit-red' : 'suit-black'}`}>
          {getCardDisplay(drawnCard.value)}{getSuitSymbol(drawnCard.suit)}
        </span>
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 12px', fontSize: 11 }}
          onClick={() => setActionType(null)}
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── Special ability mode: NON-BLOCKING hint bar ──
  if (actionType === 'useSpecial' && drawnCard) {
    const isSelfPeek = drawnCard.value >= 6 && drawnCard.value <= 7;
    const isSpy = drawnCard.value >= 8 && drawnCard.value <= 9;
    const isSwap = drawnCard.value >= 10;

    let hintText = '';
    let emoji = '✨';
    if (isSelfPeek) { hintText = 'Tap one of your face-down cards to peek'; emoji = '👁'; }
    if (isSpy) { hintText = "Tap an opponent's card to spy on it"; emoji = '🔍'; }
    if (isSwap && selectedCardIndex === null) { hintText = 'First, tap one of your cards'; emoji = '🔄'; }
    if (isSwap && selectedCardIndex !== null) { hintText = "Now tap an opponent's card to swap"; emoji = '🔄'; }

    return (
      <div className="action-hint-bar animate-fade-in">
        <span>{emoji} {hintText}</span>
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 12px', fontSize: 11 }}
          onClick={() => setActionType(null)}
        >
          Cancel
        </button>
      </div>
    );
  }

  return null;
};
