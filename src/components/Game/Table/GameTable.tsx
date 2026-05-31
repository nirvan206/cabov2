import React, { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../../../store/gameStore';
import { PlayerArea } from '../Player/PlayerArea';
import { Deck } from '../Deck/Deck';
import { DiscardStack } from '../Deck/DiscardStack';
import { ActionPanel } from '../ActionPanel';
import { CaboButton } from '../CaboButton';
import { RoundEndModal } from '../RoundEndModal';
import { GameEndModal } from '../GameEndModal';
import { SwapOverlay, SwapAnimData } from '../SwapOverlay';

interface CardHighlight {
  playerId: string;
  cardIndex: number;
  type: string;
}

// Approximate positions on the table surface (top%, left%)
const ANIM_POS: Record<string, [number, number]> = {
  'player-1': [84, 50],  // bottom (you)
  'player-2': [14, 50],  // top
  'player-3': [50, 13],  // left
  'player-4': [50, 87],  // right
  center:     [50, 50],  // deck / discard area
};

interface GameTableProps {
  gameId?: string;
  onLeave?: () => void;
}

export const GameTable: React.FC<GameTableProps> = ({ gameId, onLeave }) => {
  const {
    players,
    deck,
    discardFaceUp,
    discardFaceDown,
    currentPlayerIndex,
    currentRound,
    gamePhase,
    selectedCardIndex,
    actionType,
    drawnCard,
    caboCalled,
    caboPlayerId,
    actionLog,
    selectCard,
    drawCard,
    endPeekPhase,
    executeAITurn,
    confirmSwap,
    peekAtCard,
    unpeekCard,
    spyOpponentCard,
    unspyCard,
    executeBlindSwap,
    swapWithOpponent,
    completeSpecialAction,
    addLog,
  } = useGameStore();

  const currentPlayer = players[currentPlayerIndex];
  const isPlayerTurn = currentPlayerIndex === 0;

  // ── Highlights ──
  const [highlights, setHighlights] = useState<CardHighlight[]>([]);

  const addHighlight = useCallback((playerId: string, cardIndex: number, type: string, duration = 1500) => {
    const hl: CardHighlight = { playerId, cardIndex, type };
    setHighlights(prev => [...prev, hl]);
    setTimeout(() => {
      setHighlights(prev =>
        prev.filter(h => !(h.playerId === playerId && h.cardIndex === cardIndex && h.type === type))
      );
    }, duration);
  }, []);

  // ── Swap Animation ──
  const [swapAnim, setSwapAnim] = useState<SwapAnimData | null>(null);

  // ── Round End Reveal Delay ──
  const [showEndModal, setShowEndModal] = useState(false);

  useEffect(() => {
    if (gamePhase === 'roundEnd' || gamePhase === 'gameEnd') {
      setShowEndModal(false);
      const timer = setTimeout(() => setShowEndModal(true), 3500);
      return () => clearTimeout(timer);
    } else {
      setShowEndModal(false);
    }
  }, [gamePhase]);

  // ── Peek phase countdown ──
  const [peekProgress, setPeekProgress] = useState(100);

  useEffect(() => {
    if (gamePhase !== 'peeking') {
      setPeekProgress(100);
      return;
    }

    const startTime = Date.now();
    const duration = 5000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setPeekProgress(remaining);

      if (elapsed >= duration) {
        clearInterval(interval);
        endPeekPhase();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [gamePhase, endPeekPhase]);

  // ── AI turn trigger ──
  useEffect(() => {
    if (gamePhase === 'playing' && currentPlayerIndex !== 0 && !drawnCard && !swapAnim) {
      const timer = setTimeout(() => {
        executeAITurn();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [currentPlayerIndex, gamePhase, executeAITurn, drawnCard, swapAnim]);

  // ── Card click handler ──
  const handleCardClick = useCallback((cardIndex: number, playerId: string) => {
    if (gamePhase !== 'playing') return;
    if (swapAnim) return; // Block during animation

    // ── Swap mode: click your card → animate + swap ──
    if (actionType === 'discard' && drawnCard) {
      if (playerId === players[0]?.id) {
        const playerCard = players[0].cards[cardIndex];
        addHighlight(playerId, cardIndex, 'swap', 2800);
        addLog(`You swapped card #${cardIndex + 1}`);

        setSwapAnim({
          card1: { ...drawnCard },
          card2: { ...playerCard },
          pos1: ANIM_POS.center,
          pos2: ANIM_POS['player-1'],
          type: 'drawn',
          onComplete: () => {
            confirmSwap(cardIndex);
            setSwapAnim(null);
          },
        });
      }
      return;
    }

    // ── Special ability mode ──
    if (actionType === 'useSpecial' && drawnCard) {
      const card = drawnCard;

      // Self peek (6-7): click your card → flip for 2s
      if (card.value >= 6 && card.value <= 7) {
        if (playerId === players[0]?.id) {
          addHighlight(playerId, cardIndex, 'peek', 2200);
          addLog(`You peeked at card #${cardIndex + 1}`);
          peekAtCard(cardIndex);
          setTimeout(() => {
            unpeekCard(cardIndex);
            completeSpecialAction();
          }, 2000);
        }
        return;
      }

      // Spy (8-9): click opponent card → flip for 2s
      if (card.value >= 8 && card.value <= 9) {
        if (playerId && playerId !== players[0]?.id) {
          const target = players.find(p => p.id === playerId);
          addHighlight(playerId, cardIndex, 'spy', 2200);
          addLog(`You spied on ${target?.name}'s card #${cardIndex + 1}`);
          spyOpponentCard(playerId, cardIndex);
          setTimeout(() => {
            unspyCard(playerId, cardIndex);
            completeSpecialAction();
          }, 2000);
        }
        return;
      }

      // Swap ability (10-K): select your card, then opponent's
      if (card.value >= 10) {
        if (selectedCardIndex === null) {
          // Step 1: select your card
          if (playerId === players[0]?.id) {
            addHighlight(playerId, cardIndex, 'swap');
            selectCard(cardIndex);
          }
        } else {
          // Step 2: select opponent card → animate swap
          if (playerId && playerId !== players[0]?.id) {
            const target = players.find(p => p.id === playerId);
            const myCard = players[0].cards[selectedCardIndex];
            const oppCard = target!.cards[cardIndex];
            const isSeen = card.value >= 12; // Q or K

            const animDuration = isSeen ? 4000 : 2800;
            addHighlight(playerId, cardIndex, 'swap', animDuration);
            addHighlight(players[0].id, selectedCardIndex, 'swap', animDuration);
            addLog(`You ${isSeen ? 'seen' : 'blind'} swapped with ${target?.name}`);

            // Capture values for the closure
            const capturedSelectedIdx = selectedCardIndex;
            const capturedCardValue = card.value;

            setSwapAnim({
              card1: { ...myCard },
              card2: { ...oppCard },
              pos1: ANIM_POS['player-1'],
              pos2: ANIM_POS[playerId] || ANIM_POS.center,
              type: isSeen ? 'seen' : 'blind',
              onComplete: () => {
                if (capturedCardValue >= 12) {
                  swapWithOpponent(playerId, capturedSelectedIdx, cardIndex);
                } else {
                  executeBlindSwap(playerId, capturedSelectedIdx, cardIndex);
                }
                completeSpecialAction();
                setSwapAnim(null);
              },
            });
          }
        }
        return;
      }
    }

    // Default: toggle selection (own cards only)
    if (playerId === players[0]?.id && isPlayerTurn) {
      selectCard(cardIndex);
    }
  }, [gamePhase, actionType, drawnCard, players, selectedCardIndex, isPlayerTurn, swapAnim,
      selectCard, confirmSwap, peekAtCard, unpeekCard, spyOpponentCard, unspyCard,
      executeBlindSwap, swapWithOpponent, completeSpecialAction, addHighlight, addLog]);

  // ── Draw card handler ──
  const handleDrawCard = useCallback(() => {
    if (isPlayerTurn && gamePhase === 'playing' && !drawnCard && !swapAnim) {
      drawCard();
    }
  }, [isPlayerTurn, gamePhase, drawnCard, drawCard, swapAnim]);

  // ── Status text ──
  const getStatusText = () => {
    if (gamePhase === 'peeking') return 'Memorize your bottom cards!';
    if (gamePhase === 'dealing') return 'Dealing cards…';
    if (gamePhase === 'roundEnd') return 'Round complete!';
    if (gamePhase === 'gameEnd') return 'Game over!';
    if (gamePhase === 'playing' && currentPlayer) {
      if (swapAnim) return 'Swapping…';
      if (isPlayerTurn && !drawnCard) return 'Your turn — draw a card';
      if (isPlayerTurn && drawnCard) return 'Choose what to do with your card';
      return `${currentPlayer.name}'s turn…`;
    }
    return '';
  };

  const caboCallerName = caboCalled && caboPlayerId
    ? players.find(p => p.id === caboPlayerId)?.name
    : null;

  const getPlayerHighlights = (playerId: string) =>
    highlights.filter(h => h.playerId === playerId);

  return (
    <div className="game-container">
      <div className="table-surface">
        {/* ── Status Bar ── */}
        <div className="game-status-bar">{getStatusText()}</div>

        {/* ── Peek Phase Overlay ── */}
        {gamePhase === 'peeking' && (
          <div className="peek-overlay">
            <div className="peek-title">Memorize Your Bottom Cards</div>
            <div className="peek-bar-track">
              <div className="peek-bar-fill" style={{ width: `${peekProgress}%` }} />
            </div>
            <div className="peek-time">{Math.ceil(peekProgress / 20)}s</div>
          </div>
        )}

        {/* ── Cabo Banner ── */}
        {caboCalled && (
          <div className="cabo-banner">
            {caboCallerName} called Cabo!
          </div>
        )}

        {/* ── Table Grid Layout ── */}
        <div className="table-layout">
          {/* Top player */}
          <div className="slot-top">
            {players[1] && (
              <PlayerArea
                player={players[1]}
                isCurrentPlayer={currentPlayerIndex === 1}
                position="top"
                onCardClick={handleCardClick}
                selectedCardIndex={selectedCardIndex}
                isPeekPhase={gamePhase === 'peeking'}
                isHumanPlayer={false}
                highlights={getPlayerHighlights(players[1].id)}
              />
            )}
          </div>

          {/* Left player */}
          <div className="slot-left">
            {players[2] && (
              <PlayerArea
                player={players[2]}
                isCurrentPlayer={currentPlayerIndex === 2}
                position="left"
                onCardClick={handleCardClick}
                selectedCardIndex={selectedCardIndex}
                isPeekPhase={gamePhase === 'peeking'}
                isHumanPlayer={false}
                highlights={getPlayerHighlights(players[2].id)}
              />
            )}
          </div>

          {/* Center — deck + discards */}
          <div className="slot-center">
            <div className="table-center-area">
              <Deck
                cards={deck}
                canDraw={isPlayerTurn && gamePhase === 'playing' && !drawnCard && !swapAnim}
                onDraw={handleDrawCard}
              />
              <div className="discard-area">
                <DiscardStack cards={discardFaceUp} label="Used" />
                <DiscardStack cards={discardFaceDown} label="Discard" faceDown />
              </div>
            </div>
          </div>

          {/* Right player */}
          <div className="slot-right">
            {players[3] && (
              <PlayerArea
                player={players[3]}
                isCurrentPlayer={currentPlayerIndex === 3}
                position="right"
                onCardClick={handleCardClick}
                selectedCardIndex={selectedCardIndex}
                isPeekPhase={gamePhase === 'peeking'}
                isHumanPlayer={false}
                highlights={getPlayerHighlights(players[3].id)}
              />
            )}
          </div>

          {/* Bottom player (you) */}
          <div className="slot-bottom">
            {players[0] && (
              <PlayerArea
                player={players[0]}
                isCurrentPlayer={currentPlayerIndex === 0}
                position="bottom"
                onCardClick={handleCardClick}
                selectedCardIndex={selectedCardIndex}
                isPeekPhase={gamePhase === 'peeking'}
                isHumanPlayer={true}
                highlights={getPlayerHighlights(players[0].id)}
              />
            )}
          </div>
        </div>

        {/* ── Swap Animation ── */}
        <SwapOverlay anim={swapAnim} />

        {/* ── Cabo Button ── */}
        {!swapAnim && <CaboButton />}

        {/* ── Round Badge ── */}
        <div className="round-badge">
          Round <span className="round-badge-num">{currentRound}</span>/10
        </div>

        {/* ── Action Log ── */}
        <div className="action-log">
          {actionLog.slice(-6).map((entry, i, arr) => (
            <div
              key={`${entry}-${i}`}
              className="action-log-entry"
              style={{ opacity: 0.35 + (i / arr.length) * 0.65 }}
            >
              {entry}
            </div>
          ))}
        </div>

        {/* ── Reveal Banner (before modal appears) ── */}
        {(gamePhase === 'roundEnd' || gamePhase === 'gameEnd') && !showEndModal && (
          <div className="reveal-banner animate-fade-in">
            🃏 All cards revealed!
          </div>
        )}
      </div>

      {/* ── Overlays (outside table) ── */}
      <ActionPanel />
      {showEndModal && <RoundEndModal />}
      {showEndModal && <GameEndModal />}
    </div>
  );
};