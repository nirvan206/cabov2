import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useMPStore, MPCard, MPPlayer } from '../../../store/mpStore';

// ── Card value/suit helpers ──────────────────────────────────────
const RANK: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const SUIT_SYM: Record<string, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
};
const RED_SUITS = new Set(['hearts', 'diamonds']);

const rankStr = (v: number | null) => v == null ? '' : (RANK[v] ?? String(v));
const suitStr = (s: string | null) => s ? (SUIT_SYM[s] ?? s) : '';
const suitClass = (s: string | null) => s && RED_SUITS.has(s) ? 'suit-red' : 'suit-black';

// ── Reusable MP card that matches the original design ─────────────
interface MPCardViewProps {
  card?: MPCard;
  size?: 'sm' | 'md';
  faceDown?: boolean;
  glow?: boolean;      // golden glow (selected / peek)
  flash?: boolean;     // swap animation
  dimmed?: boolean;
  clickable?: boolean;
  onClick?: () => void;
  label?: string;
}

const MPCardView: React.FC<MPCardViewProps> = React.memo(({
  card, size = 'md', faceDown, glow, flash, dimmed, clickable, onClick, label,
}) => {
  const hidden = faceDown || !card || card.value == null;
  const cls = [
    'card-wrapper',
    `card-${size}`,
    clickable ? 'interactive' : '',
    glow ? 'mp-card-glow' : '',
    flash ? 'mp-card-flash' : '',
    dimmed ? 'mp-card-dimmed' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} onClick={onClick} style={{ position: 'relative' }}>
      <div className={`card-flipper ${hidden ? 'flipped' : ''}`}>
        {/* FRONT FACE */}
        <div className="card-face-side">
          <div className="card-face-inner">
            <div className="card-inner-frame" />
            {card && card.value !== null && (
              <>
                <div className={`card-corner card-corner-tl ${suitClass(card.suit)}`}>
                  <span className="card-corner-value">{rankStr(card.value)}</span>
                  <span className="card-corner-suit">{suitStr(card.suit)}</span>
                </div>
                <div className="card-center-area">
                  <span style={{ fontSize: size === 'sm' ? 18 : 24 }} className={suitClass(card.suit)}>
                    {suitStr(card.suit)}
                  </span>
                </div>
                <div className={`card-corner card-corner-br ${suitClass(card.suit)}`}>
                  <span className="card-corner-value">{rankStr(card.value)}</span>
                  <span className="card-corner-suit">{suitStr(card.suit)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* BACK FACE */}
        <div className="card-back-side">
          <div className="card-back-inner" />
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  return prev.card?.id === next.card?.id &&
         prev.card?.value === next.card?.value &&
         prev.card?.suit === next.card?.suit &&
         prev.card?.location === next.card?.location &&
         prev.card?.hand_index === next.card?.hand_index &&
         prev.card?.face_up === next.card?.face_up &&
         prev.card?.owner_seat === next.card?.owner_seat &&
         prev.size === next.size &&
         prev.faceDown === next.faceDown &&
         prev.glow === next.glow &&
         prev.flash === next.flash &&
         prev.dimmed === next.dimmed &&
         prev.clickable === next.clickable &&
         prev.label === next.label;
});

type UIMode = 'idle' | 'drawn' | 'swap-drawn' | 'use-peek' | 'use-spy'
  | 'use-blind-my' | 'use-blind-opp' | 'use-seen-my' | 'use-seen-opp';

const specialName = (v: number | null) => {
  if (!v) return null;
  if (v === 6 || v === 7) return '👁 Peek (your card)';
  if (v === 8 || v === 9) return '🕵️ Spy (opponent)';
  if (v === 10 || v === 11) return '🔀 Blind Swap';
  if (v >= 12) return '🔀 Seen Swap';
  return null;
};

// ── Stable style objects (avoid recreating on every render) ──
const deckShadow1 = { top: 2, left: 2 };
const deckShadow2 = { top: 4, left: 4 };
const discardLabelStyle = { marginBottom: 4 };
const emptyDiscardStyle = { border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 8, display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const, color: 'rgba(255,255,255,0.2)', fontSize: 11 };
const youLabelStyle = { fontSize: 10, opacity: 0.4 };
const abilityBtnStyle = { background: '#3b82f6', borderColor: '#2563eb' };

// ── Split Memoized Components ─────────────────────────────────

interface OpponentHandProps {
  opp: MPPlayer;
  oppCards: MPCard[];
  isActive: boolean;
  canClickOpp: boolean;
  peekedAt: { seat: number; idx: number } | null;
  revealedCards: Record<string, { value: number; suit: string }>;
  isEnd: boolean;
  onOppCardClick: (oppSeat: number, idx: number) => void;
}

const OpponentHand: React.FC<OpponentHandProps> = React.memo(({
  opp, oppCards, isActive, canClickOpp, peekedAt, revealedCards, isEnd, onOppCardClick
}) => {
  return (
    <div className="player-area">
      <div className="player-info">
        <div className={`player-name ${isActive ? 'active' : ''}`}>
          {isActive && <span className="turn-dot" />}
          {opp.username}
        </div>
        <div className="player-score">{opp.total_score} pts</div>
      </div>
      <div className="player-cards-grid">
        {(oppCards.length > 0 ? oppCards : Array.from({ length: 4 }) as any[]).map((c: MPCard | null, i) => {
          const isPeekedHere = peekedAt?.seat === opp.seat_index && peekedAt.idx === i;
          const revealed = c?.id ? revealedCards[c.id] : null;
          const displayCard = revealed ? { ...c, value: revealed.value, suit: revealed.suit } : c;

          return (
            <MPCardView
              key={c?.id ?? i}
              card={displayCard as MPCard}
              faceDown={isEnd ? false : !revealed}
              size="sm"
              glow={isPeekedHere || (canClickOpp)}
              clickable={canClickOpp}
              label={isPeekedHere ? '👁' : undefined}
              onClick={canClickOpp ? () => onOppCardClick(opp.seat_index, i) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
});

interface CenterPileProps {
  isMyTurn: boolean;
  drawnCard: MPCard | null;
  isPlaying: boolean;
  deckCount: number;
  topDiscardDown: MPCard | null;
  topDiscardUp: MPCard | null;
  mode: UIMode;
  onDeckClick: () => void;
  onAbilityClick: () => void;
  onKeepCard: () => void;
  onModeChange: (mode: UIMode) => void;
}

const CenterPile: React.FC<CenterPileProps> = React.memo(({
  isMyTurn, drawnCard, isPlaying, deckCount, topDiscardDown, topDiscardUp, mode,
  onDeckClick, onAbilityClick, onKeepCard, onModeChange
}) => {
  return (
    <div className="table-center-area">
      {/* Deck */}
      <div
        className={`deck-container ${(!isMyTurn || drawnCard || !isPlaying) ? 'disabled' : ''}`}
        onClick={onDeckClick}
      >
        <div className="deck-shadow-card card-md" style={deckShadow1} />
        <div className="deck-shadow-card card-md" style={deckShadow2} />
        <div className="deck-top-card card-md">
          <div className="card-back-inner" />
        </div>
        <div className="deck-label">{deckCount} cards</div>
      </div>

      {/* Drawn card (floating) */}
      {drawnCard && isMyTurn && (
        <div className="mp-drawn-panel">
          <div className="mp-drawn-label">DRAWN</div>
          <MPCardView card={drawnCard} glow size="md" />
          {mode === 'drawn' && (
            <>
              {specialName(drawnCard.value) && (
                <button className="mp-ability-btn" onClick={onAbilityClick}>
                  {specialName(drawnCard.value)}
                </button>
              )}
              <button className="mp-ability-btn" style={abilityBtnStyle} onClick={() => onModeChange('swap-drawn')}>
                🔀 Swap
              </button>
              <button className="mp-discard-btn" onClick={onKeepCard}>
                🗑 Discard
              </button>
            </>
          )}
          {mode !== 'drawn' && (
            <button className="mp-cancel-btn" onClick={() => onModeChange('drawn')}>✕ Cancel Action</button>
          )}
        </div>
      )}

      {/* Discard pile */}
      <div className="discard-area">
        <div style={{ textAlign: 'center' }}>
          <div className="deck-label" style={discardLabelStyle}>DISCARD</div>
          {topDiscardDown
            ? <MPCardView card={topDiscardDown} faceDown size="md" />
            : <div className="card-md" style={emptyDiscardStyle}>empty</div>
          }
        </div>
      </div>

      {/* Used pile */}
      <div className="discard-area">
        <div style={{ textAlign: 'center' }}>
          <div className="deck-label" style={discardLabelStyle}>USED</div>
          {topDiscardUp
            ? <MPCardView card={topDiscardUp} size="md" />
            : <div className="card-md" style={emptyDiscardStyle}>empty</div>
          }
        </div>
      </div>
    </div>
  );
});

interface MyHandProps {
  isMyTurn: boolean;
  me: MPPlayer | undefined;
  myCards: MPCard[];
  mySeat: number | null;
  mode: UIMode;
  isPeeking: boolean;
  isEnd: boolean;
  isPlaying: boolean;
  drawnCard: MPCard | null;
  caboCalled: boolean;
  peekedAt: { seat: number; idx: number } | null;
  revealedCards: Record<string, { value: number; suit: string }>;
  flashIdx: number | null;
  onMyCardClick: (idx: number) => void;
  onCallCabo: () => void;
  onModeChange: (mode: UIMode) => void;
}

const MyHand: React.FC<MyHandProps> = React.memo(({
  isMyTurn, me, myCards, mySeat, mode, isPeeking, isEnd, isPlaying, drawnCard, caboCalled,
  peekedAt, revealedCards, flashIdx, onMyCardClick, onCallCabo, onModeChange
}) => {
  const canClick = isMyTurn && (mode === 'swap-drawn' || mode === 'use-peek' || mode === 'use-blind-my' || mode === 'use-seen-my');
  
  return (
    <div className="player-area">
      <div className="player-info">
        <div className={`player-name ${isMyTurn ? 'active' : ''}`}>
          {isMyTurn && <span className="turn-dot" />}
          {me?.username ?? 'You'} <span style={youLabelStyle}>(you)</span>
        </div>
        <div className="player-score">{me?.total_score ?? 0} pts</div>
      </div>
      <div className="player-cards-grid">
        {(myCards.length > 0 ? myCards : Array.from({ length: 4 }) as any[]).map((c: MPCard | null, i) => {
          const isBottom = i >= 2;
          const isBeingPeeked = peekedAt?.seat === mySeat && peekedAt.idx === i;
          const isSelected = mode === 'use-blind-opp' && i === 0; // Highlight selected card for swapping
          const revealed = c?.id ? revealedCards[c.id] : null;
          const displayCard = revealed ? { ...c, value: revealed.value, suit: revealed.suit } : c;

          return (
            <MPCardView
              key={c?.id ?? i}
              card={displayCard as MPCard}
              size="md"
              faceDown={isEnd ? false : revealed ? false : isBeingPeeked ? false : (isPeeking && isBottom) ? false : true}
              glow={isSelected || isBeingPeeked || (isPeeking && isBottom) || (mode === 'swap-drawn' && isMyTurn)}
              flash={flashIdx === i}
              dimmed={isPeeking && !isBottom}
              clickable={canClick}
              label={isBeingPeeked ? 'PEEK' : (isPeeking && isBottom) ? 'PEEK' : undefined}
              onClick={canClick ? () => onMyCardClick(i) : undefined}
            />
          );
        })}
      </div>

      {mode === 'swap-drawn' && (
        <div className="flex flex-col items-center mt-2 gap-1" style={{ zIndex: 10 }}>
          <span className="text-yellow-400 text-xs font-semibold animate-pulse">Select one of your cards to swap</span>
          <button 
            className="btn btn-ghost btn-xs" 
            onClick={() => onModeChange('drawn')}
            style={{ padding: '2px 8px', fontSize: 10 }}
          >
            ✕ Cancel Swap
          </button>
        </div>
      )}

      {isMyTurn && !drawnCard && isPlaying && !caboCalled && (
        <button className="cabo-call-btn mt-2" onClick={onCallCabo}>📢 CABO</button>
      )}
    </div>
  );
});

interface ActionLogDisplayProps {
  actionLog: string[];
}

const ActionLogDisplay: React.FC<ActionLogDisplayProps> = React.memo(({ actionLog }) => {
  return (
    <div className="action-log">
      {actionLog.slice(-6).map((entry, i, arr) => (
        <div key={i} className="action-log-entry" style={{ opacity: 0.35 + (i / arr.length) * 0.65 }}>
          {entry}
        </div>
      ))}
    </div>
  );
});

// ── Main MPGameTable ───────────────────────────────────────────

interface MPGameTableProps {
  gameId: string;
  onLeave: () => void;
}

export const MPGameTable: React.FC<MPGameTableProps> = ({ gameId, onLeave }) => {
  const {
    game, players, cards, actionLog, drawnCard, mySeat, loading, error, setError,
    loadGameState, drawCard, keepCard, swapDrawn, peekCard, spyCard,
    blindSwap, swapWithPeek, callCabo, nextRound, leaveGame,
  } = useMPStore();

  const [mode, setMode] = useState<UIMode>('idle');
  const [myCardSel, setMyCardSel] = useState<number | null>(null);
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  const [peekedAt, setPeekedAt] = useState<{ seat: number; idx: number } | null>(null);
  const [peekCountdown, setPeekCountdown] = useState(7);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [revealedCards, setRevealedCards] = useState<Record<string, { value: number, suit: string }>>({});

  useEffect(() => {
    loadGameState(gameId);
  }, [gameId]);

  useEffect(() => {
    if (!drawnCard) { setMode('idle'); setMyCardSel(null); }
    else setMode('drawn');
  }, [drawnCard?.id]);

  // Peek phase countdown (client-side endPeeking trigger fallback)
  useEffect(() => {
    if (game?.phase === 'peeking') {
      setPeekCountdown(7);
      timerRef.current = setInterval(() => {
        setPeekCountdown(p => {
          if (p <= 1) {
            clearInterval(timerRef.current!);
            useMPStore.getState().endPeeking();
            return 0;
          }
          return p - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [game?.phase]);

  const flash = useCallback((idx: number) => {
    setFlashIdx(idx);
    setTimeout(() => setFlashIdx(null), 1000);
  }, []);

  const peek = useCallback((seat: number, idx: number, ms = 3000) => {
    setPeekedAt({ seat, idx });
    setTimeout(() => setPeekedAt(null), ms);
  }, []);

  const tempReveal = useCallback((cardsToReveal: MPCard[], ms = 2500) => {
    setRevealedCards(prev => {
      const next = { ...prev };
      cardsToReveal.forEach(c => { if (c?.id) next[c.id] = { value: c.value!, suit: c.suit! }; });
      return next;
    });
    setTimeout(() => {
      setRevealedCards(prev => {
        const next = { ...prev };
        cardsToReveal.forEach(c => { if (c?.id) delete next[c.id]; });
        return next;
      });
    }, ms);
  }, []);

  const isMyTurn = game?.current_turn_seat === mySeat;
  const phase = game?.phase;
  const isPeeking = phase === 'peeking';
  const isPlaying = phase === 'playing';
  const isEnd = phase === 'round_end' || phase === 'game_end';

  // ── Memoized card filtering & groupings ──────────────────────
  const me = useMemo(() => players.find(p => p.seat_index === mySeat), [players, mySeat]);
  const others = useMemo(() => players.filter(p => p.seat_index !== mySeat), [players, mySeat]);

  const myCards = useMemo(() =>
    cards
      .filter(c => c.owner_seat === mySeat && c.location === 'hand' && c.hand_index !== 99)
      .sort((a, b) => (a.hand_index ?? 0) - (b.hand_index ?? 0)),
    [cards, mySeat]
  );

  const oppCardsCache = useMemo(() => {
    const cache: Record<number, MPCard[]> = {};
    others.forEach(o => {
      cache[o.seat_index] = cards
        .filter(c => c.owner_seat === o.seat_index && c.location === 'hand' && c.hand_index !== 99)
        .sort((a, b) => (a.hand_index ?? 0) - (b.hand_index ?? 0));
    });
    return cache;
  }, [cards, others]);

  const deckCount = useMemo(() => cards.filter(c => c.location === 'deck').length, [cards]);
  const discardUpCards = useMemo(() => cards.filter(c => c.location === 'discard_up'), [cards]);
  const discardDownCards = useMemo(() => cards.filter(c => c.location === 'discard_down'), [cards]);
  
  const topDiscardUp = useMemo(() => discardUpCards.length ? discardUpCards[discardUpCards.length - 1] : null, [discardUpCards]);
  const topDiscardDown = useMemo(() => discardDownCards.length ? discardDownCards[discardDownCards.length - 1] : null, [discardDownCards]);

  const activePlayer = useMemo(() => players.find(p => p.seat_index === game?.current_turn_seat), [players, game?.current_turn_seat]);

  // Assign slots to opponents
  const slotMap = useMemo(() => {
    const map: Record<number, 'top' | 'left' | 'right'> = {};
    const slotOrder: ('top' | 'left' | 'right')[] = ['top', 'left', 'right'];
    others.forEach((p, i) => { if (i < 3) map[p.seat_index] = slotOrder[i]; });
    return map;
  }, [others]);

  const canClickOpp = isMyTurn && (mode === 'use-spy' || mode === 'use-blind-opp' || mode === 'use-seen-opp');

  // ── Instruction text ──
  const instrText = () => {
    if (isPeeking) return `👀 Memorize your bottom 2 cards — ${peekCountdown}s`;
    if (mode === 'drawn' && !drawnCard) return '';
    if (mode === 'drawn') return `Drawn: ${rankStr(drawnCard!.value)} ${suitStr(drawnCard!.suit)} — choose swap, use ability, or discard`;
    if (mode === 'swap-drawn') return '🔄 Click ONE of your cards to swap it';
    if (mode === 'use-peek') return '👁 Click ONE of your cards to peek at it';
    if (mode === 'use-spy') return '🕵️ Click an opponent\'s card to spy on it';
    if (mode === 'use-blind-my') return '🔀 Select YOUR card to swap out';
    if (mode === 'use-blind-opp') return '🔀 Now select the OPPONENT\'S card';
    if (mode === 'use-seen-my') return '🔀 Select YOUR card to swap (you\'ll see both first)';
    if (mode === 'use-seen-opp') return '🔀 Now select the OPPONENT\'S card';
    if (isMyTurn && isPlaying && !drawnCard) return 'Your turn — click the deck to draw';
    return `${activePlayer?.username ?? '...'}'s turn`;
  };

  // ── Handlers ──
  const handleOppCardClick = useCallback((oppSeat: number, i: number) => {
    if (mode === 'use-spy') {
      spyCard(oppSeat, i).then(data => { if (data?.card) tempReveal([data.card]); peek(oppSeat, i); });
      setMode('idle');
    }
    else if (mode === 'use-blind-opp') {
      blindSwap(myCardSel!, oppSeat, i);
      setMode('idle');
      setMyCardSel(null);
      flash(myCardSel!);
    }
    else if (mode === 'use-seen-opp') {
      swapWithPeek(myCardSel!, oppSeat, i, 'reveal').then(data => {
        if (data?.myCard && data?.targetCard) {
          tempReveal([data.myCard, data.targetCard], 2500);
          setTimeout(() => {
            swapWithPeek(myCardSel!, oppSeat, i, 'swap');
            flash(myCardSel!);
            setMode('idle');
            setMyCardSel(null);
          }, 2600);
        }
      });
    }
  }, [mode, myCardSel, spyCard, blindSwap, swapWithPeek, tempReveal, peek, flash]);

  const handleMyCardClick = useCallback((i: number) => {
    if (mode === 'swap-drawn') { flash(i); swapDrawn(i); setMode('idle'); }
    else if (mode === 'use-peek') { peekCard(i).then(data => { if (data?.card) tempReveal([data.card]); peek(mySeat!, i); }); setMode('idle'); }
    else if (mode === 'use-blind-my') { setMyCardSel(i); setMode('use-blind-opp'); }
    else if (mode === 'use-seen-my') { setMyCardSel(i); setMode('use-seen-opp'); }
  }, [mode, mySeat, flash, swapDrawn, peekCard, tempReveal, peek]);

  const handleAbilityClick = useCallback(() => {
    if (!drawnCard) return;
    const v = drawnCard.value ?? 0;
    if (v === 6 || v === 7) setMode('use-peek');
    else if (v === 8 || v === 9) setMode('use-spy');
    else if (v === 10 || v === 11) setMode('use-blind-my');
    else if (v >= 12) setMode('use-seen-my');
  }, [drawnCard]);

  const handleKeepCard = useCallback(() => { keepCard(); setMode('idle'); }, [keepCard]);
  const handleDeckClick = useCallback(() => {
    if (isMyTurn && !drawnCard && isPlaying) drawCard();
  }, [isMyTurn, drawnCard, isPlaying, drawCard]);
  const handleLeave = useCallback(async () => { await leaveGame(); onLeave(); }, [leaveGame, onLeave]);
  const handleDismissError = useCallback(() => setError(null), [setError]);

  const peekWidth = useMemo(() => `${(peekCountdown / 7) * 100}%`, [peekCountdown]);

  const renderOppSlot = (slot: 'top' | 'left' | 'right') => {
    const opp = others.find(o => slotMap[o.seat_index] === slot);
    if (!opp) return null;
    return (
      <div className={`slot-${slot}`}>
        <OpponentHand
          opp={opp}
          oppCards={oppCardsCache[opp.seat_index] || []}
          isActive={game?.current_turn_seat === opp.seat_index}
          canClickOpp={canClickOpp}
          peekedAt={peekedAt}
          revealedCards={revealedCards}
          isEnd={isEnd}
          onOppCardClick={handleOppCardClick}
        />
      </div>
    );
  };

  if (!game) return (
    <div className="game-container">
      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
        <div className="splash-spinner" style={{ margin: '0 auto 16px' }} />
        Loading game…
      </div>
    </div>
  );

  return (
    <div className="game-container">
      <div className="table-surface">

        {/* Status bar */}
        <div className="game-status-bar">{instrText()}</div>

        {/* Peek overlay */}
        {isPeeking && (
          <div className="peek-overlay">
            <div className="peek-title">Memorize Your Bottom 2 Cards</div>
            <div className="peek-bar-track">
              <div className="peek-bar-fill" style={{ width: peekWidth }} />
            </div>
            <div className="peek-time">{peekCountdown}s</div>
          </div>
        )}

        {/* Cabo banner */}
        {game.cabo_called && (
          <div className="cabo-banner">
            {players.find(p => p.seat_index === game.cabo_caller_seat)?.username ?? 'Someone'} called CABO!
          </div>
        )}

        {/* Error bar */}
        {error && (
          <div className="mp-error-top">⚠️ {error} <button onClick={handleDismissError}>✕</button></div>
        )}

        {/* Table grid */}
        <div className="table-layout">

          {renderOppSlot('top')}
          {renderOppSlot('left')}
          {renderOppSlot('right')}

          {/* Center: deck + drawn + discard */}
          <div className="slot-center">
            <CenterPile
              isMyTurn={isMyTurn}
              drawnCard={drawnCard}
              isPlaying={isPlaying}
              deckCount={deckCount}
              topDiscardDown={topDiscardDown}
              topDiscardUp={topDiscardUp}
              mode={mode}
              onDeckClick={handleDeckClick}
              onAbilityClick={handleAbilityClick}
              onKeepCard={handleKeepCard}
              onModeChange={setMode}
            />
          </div>

          {/* Bottom — MY cards */}
          <div className="slot-bottom">
            <MyHand
              isMyTurn={isMyTurn}
              me={me}
              myCards={myCards}
              mySeat={mySeat}
              mode={mode}
              isPeeking={isPeeking}
              isEnd={isEnd}
              isPlaying={isPlaying}
              drawnCard={drawnCard}
              caboCalled={game.cabo_called}
              peekedAt={peekedAt}
              revealedCards={revealedCards}
              flashIdx={flashIdx}
              onMyCardClick={handleMyCardClick}
              onCallCabo={callCabo}
              onModeChange={setMode}
            />
          </div>

        </div>{/* table-layout */}

        {/* Round badge */}
        <div className="round-badge">
          Round <span className="round-badge-num">{game.current_round}</span>/10
        </div>

        {/* Action log */}
        <ActionLogDisplay actionLog={actionLog} />

        {/* Leave button */}
        <button className="mp-leave-btn" onClick={handleLeave}>
          ← Leave
        </button>

        {/* Round/Game End overlay */}
        {isEnd && (
          <div className="mp-end-overlay">
            <div className="mp-end-card animate-fade-in">
              <div className="mp-end-title">
                {phase === 'game_end' ? '🏆 Game Over!' : '🃏 Round Over!'}
              </div>
              <div className="mp-end-scores">
                {[...players].sort((a, b) => a.total_score - b.total_score).map((p, i) => (
                  <div key={p.id} className={`mp-score-row ${i === 0 ? 'winner' : ''}`}>
                    <span>{i === 0 ? '🥇 ' : `${i + 1}. `}{p.username}{p.seat_index === mySeat ? ' (you)' : ''}</span>
                    <span className="mp-score-val">{p.total_score} pts</span>
                  </div>
                ))}
              </div>
              {phase === 'round_end' && mySeat === 0 && (
                <button className="btn btn-green btn-lg w-full" onClick={nextRound} disabled={loading}>
                  ▶ Next Round
                </button>
              )}
              {phase === 'round_end' && mySeat !== 0 && (
                <p className="mp-waiting-msg">Waiting for host to start next round…</p>
              )}
              {phase === 'game_end' && (
                <button className="btn btn-ghost w-full" onClick={handleLeave}>
                  ← Back to Lobby
                </button>
              )}
            </div>
          </div>
        )}

      </div>{/* table-surface */}
    </div>
  );
};
