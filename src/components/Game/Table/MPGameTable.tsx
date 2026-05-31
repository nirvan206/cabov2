import React, { useEffect, useState, useRef } from 'react';
import { useMPStore, MPCard } from '../../../store/mpStore';

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

const MPCardView: React.FC<MPCardViewProps> = ({
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
      {glow && <div className="card-selected-glow" />}
      {label && (
        <div className="mp-card-badge">{label}</div>
      )}
      {hidden ? (
        // Card back — same as original
        <div className="card-back-inner" />
      ) : (
        // Card face — same as original
        <div className={`card-face-inner`}>
          <div className="card-inner-frame" />
          <div className={`card-corner card-corner-tl ${suitClass(card!.suit)}`}>
            <span className="card-corner-value">{rankStr(card!.value)}</span>
            <span className="card-corner-suit">{suitStr(card!.suit)}</span>
          </div>
          <div className="card-center-area">
            <span style={{ fontSize: size === 'sm' ? 18 : 24 }} className={suitClass(card!.suit)}>
              {suitStr(card!.suit)}
            </span>
          </div>
          <div className={`card-corner card-corner-br ${suitClass(card!.suit)}`}>
            <span className="card-corner-value">{rankStr(card!.value)}</span>
            <span className="card-corner-suit">{suitStr(card!.suit)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ── MPGameTable ──────────────────────────────────────────────────
interface MPGameTableProps {
  gameId: string;
  onLeave: () => void;
}

type UIMode = 'idle' | 'drawn' | 'use-peek' | 'use-spy'
  | 'use-blind-my' | 'use-blind-opp' | 'use-seen-my' | 'use-seen-opp';

const specialName = (v: number | null) => {
  if (!v) return null;
  if (v === 6 || v === 7) return '👁 Peek (your card)';
  if (v === 8 || v === 9) return '🕵️ Spy (opponent)';
  if (v === 10 || v === 11) return '🔀 Blind Swap';
  if (v >= 12) return '🔀 Seen Swap';
  return null;
};

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

  useEffect(() => {
    loadGameState(gameId);
    const iv = setInterval(() => loadGameState(gameId), 4000);
    return () => clearInterval(iv);
  }, [gameId]);

  useEffect(() => {
    if (!drawnCard) { setMode('idle'); setMyCardSel(null); }
    else setMode('drawn');
  }, [drawnCard?.id]);

  // Peek phase countdown
  useEffect(() => {
    if (game?.phase === 'peeking') {
      setPeekCountdown(7);
      timerRef.current = setInterval(() => {
        setPeekCountdown(p => { if (p <= 1) { clearInterval(timerRef.current!); return 0; } return p - 1; });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [game?.phase]);

  const flash = (idx: number) => {
    setFlashIdx(idx);
    setTimeout(() => setFlashIdx(null), 1000);
  };
  const peek = (seat: number, idx: number, ms = 3000) => {
    setPeekedAt({ seat, idx });
    setTimeout(() => setPeekedAt(null), ms);
  };

  if (!game) return (
    <div className="game-container">
      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
        <div className="splash-spinner" style={{ margin: '0 auto 16px' }} />
        Loading game…
      </div>
    </div>
  );

  const isMyTurn = game.current_turn_seat === mySeat;
  const phase = game.phase;
  const isPeeking = phase === 'peeking';
  const isPlaying = phase === 'playing';
  const isEnd = phase === 'round_end' || phase === 'game_end';

  // Sort players: me at bottom (slot-bottom), others distributed top/left/right
  const me = players.find(p => p.seat_index === mySeat);
  const others = players.filter(p => p.seat_index !== mySeat);

  const myCards = cards
    .filter(c => c.owner_seat === mySeat && c.location === 'hand')
    .sort((a, b) => (a.hand_index ?? 0) - (b.hand_index ?? 0));

  const deckCards = cards.filter(c => c.location === 'deck');
  const discardCards = cards.filter(c => c.location === 'discard');
  const topDiscard = discardCards.length ? discardCards[discardCards.length - 1] : null;

  const activePlayer = players.find(p => p.seat_index === game.current_turn_seat);

  const getOppCards = (seat: number) =>
    cards.filter(c => c.owner_seat === seat && c.location === 'hand')
      .sort((a, b) => (a.hand_index ?? 0) - (b.hand_index ?? 0));

  // Assign slots to opponents
  const slotMap: Record<number, 'top' | 'left' | 'right'> = {};
  const slotOrder: ('top' | 'left' | 'right')[] = ['top', 'left', 'right'];
  others.forEach((p, i) => { if (i < 3) slotMap[p.seat_index] = slotOrder[i]; });

  const canClickOpp = isMyTurn && (mode === 'use-spy' || mode === 'use-blind-opp' || mode === 'use-seen-opp');

  // ── Instruction text ─────────────────────────────────────────
  const instrText = () => {
    if (isPeeking) return `👀 Memorize your bottom 2 cards — ${peekCountdown}s`;
    if (mode === 'drawn' && !drawnCard) return '';
    if (mode === 'drawn') return `Drawn: ${rankStr(drawnCard!.value)} ${suitStr(drawnCard!.suit)} — swap a card below, use ability, or discard`;
    if (mode === 'use-peek') return '👁 Click ONE of your cards to peek at it';
    if (mode === 'use-spy') return '🕵️ Click an opponent\'s card to spy on it';
    if (mode === 'use-blind-my') return '🔀 Select YOUR card to swap out';
    if (mode === 'use-blind-opp') return '🔀 Now select the OPPONENT\'S card';
    if (mode === 'use-seen-my') return '🔀 Select YOUR card to swap (you\'ll see both first)';
    if (mode === 'use-seen-opp') return '🔀 Now select the OPPONENT\'S card';
    if (isMyTurn && isPlaying && !drawnCard) return 'Your turn — click the deck to draw';
    return `${activePlayer?.username ?? '...'}'s turn`;
  };

  // ── Player area (opponents) ───────────────────────────────────
  const renderOppSlot = (slot: 'top' | 'left' | 'right') => {
    const opp = others.find(o => slotMap[o.seat_index] === slot);
    if (!opp) return null;
    const oppCards = getOppCards(opp.seat_index);
    const isActive = game.current_turn_seat === opp.seat_index;
    return (
      <div className={`slot-${slot}`}>
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
              return (
                <MPCardView
                  key={c?.id ?? i}
                  card={c ?? undefined}
                  faceDown={!isPeekedHere}
                  size="sm"
                  glow={isPeekedHere || (canClickOpp)}
                  clickable={canClickOpp}
                  label={isPeekedHere ? '👁' : undefined}
                  onClick={canClickOpp ? () => {
                    if (mode === 'use-spy') { spyCard(opp.seat_index, i).then(() => { peek(opp.seat_index, i); }); setMode('idle'); }
                    else if (mode === 'use-blind-opp') { blindSwap(myCardSel!, opp.seat_index, i); setMode('idle'); setMyCardSel(null); flash(myCardSel!); }
                    else if (mode === 'use-seen-opp') { peek(mySeat!, myCardSel!, 2500); peek(opp.seat_index, i, 2500); setTimeout(() => { swapWithPeek(myCardSel!, opp.seat_index, i); flash(myCardSel!); setMode('idle'); setMyCardSel(null); }, 2600); }
                  } : undefined}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="game-container">
      <div className="table-surface">

        {/* ── Status bar ── */}
        <div className="game-status-bar">{instrText()}</div>

        {/* ── Peek overlay ── */}
        {isPeeking && (
          <div className="peek-overlay">
            <div className="peek-title">Memorize Your Bottom 2 Cards</div>
            <div className="peek-bar-track">
              <div className="peek-bar-fill" style={{ width: `${(peekCountdown / 7) * 100}%` }} />
            </div>
            <div className="peek-time">{peekCountdown}s</div>
          </div>
        )}

        {/* ── Cabo banner ── */}
        {game.cabo_called && (
          <div className="cabo-banner">
            {players.find(p => p.seat_index === game.cabo_caller_seat)?.username ?? 'Someone'} called CABO!
          </div>
        )}

        {/* ── Error bar ── */}
        {error && (
          <div className="mp-error-top">⚠️ {error} <button onClick={() => setError(null)}>✕</button></div>
        )}

        {/* ── Table grid ── */}
        <div className="table-layout">

          {/* Opponents in their slots */}
          {renderOppSlot('top')}
          {renderOppSlot('left')}
          {renderOppSlot('right')}

          {/* Center: deck + drawn + discard */}
          <div className="slot-center">
            <div className="table-center-area">

              {/* Deck */}
              <div
                className={`deck-container ${(!isMyTurn || drawnCard || !isPlaying) ? 'disabled' : ''}`}
                onClick={isMyTurn && !drawnCard && isPlaying ? drawCard : undefined}
              >
                <div className="deck-shadow-card card-md" style={{ top: 2, left: 2 }} />
                <div className="deck-shadow-card card-md" style={{ top: 4, left: 4 }} />
                <div className="deck-top-card card-md">
                  <div className="card-back-inner" />
                </div>
                <div className="deck-label">{deckCards.length} cards</div>
              </div>

              {/* Drawn card (floating) */}
              {drawnCard && isMyTurn && (
                <div className="mp-drawn-panel">
                  <div className="mp-drawn-label">DRAWN</div>
                  <MPCardView card={drawnCard} glow size="md" />
                  {specialName(drawnCard.value) && (
                    <button
                      className="mp-ability-btn"
                      onClick={() => {
                        const v = drawnCard.value ?? 0;
                        if (v === 7 || v === 8) setMode('use-peek');
                        else if (v === 9 || v === 10) setMode('use-spy');
                        else if (v === 11) setMode('use-blind-my');
                        else if (v >= 12) setMode('use-seen-my');
                      }}
                    >
                      {specialName(drawnCard.value)}
                    </button>
                  )}
                  <button className="mp-discard-btn" onClick={() => { keepCard(); setMode('idle'); }}>
                    🗑 Discard
                  </button>
                  {(mode === 'use-peek' || mode === 'use-spy' || mode.startsWith('use-blind') || mode.startsWith('use-seen')) && (
                    <button className="mp-cancel-btn" onClick={() => setMode('drawn')}>✕ Cancel</button>
                  )}
                </div>
              )}

              {/* Discard pile */}
              <div className="discard-area">
                <div style={{ textAlign: 'center' }}>
                  <div className="deck-label" style={{ marginBottom: 4 }}>DISCARD</div>
                  {topDiscard
                    ? <MPCardView card={topDiscard} size="md" />
                    : <div className="card-md" style={{ border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>empty</div>
                  }
                </div>
              </div>
            </div>
          </div>

          {/* Bottom — MY cards */}
          <div className="slot-bottom">
            <div className="player-area">
              <div className="player-info">
                <div className={`player-name ${isMyTurn ? 'active' : ''}`}>
                  {isMyTurn && <span className="turn-dot" />}
                  {me?.username ?? 'You'} <span style={{ fontSize: 10, opacity: 0.4 }}>(you)</span>
                </div>
                <div className="player-score">{me?.total_score ?? 0} pts</div>
              </div>
              <div className="player-cards-grid">
                {(myCards.length > 0 ? myCards : Array.from({ length: 4 }) as any[]).map((c: MPCard | null, i) => {
                  const isBottom = i >= 2; // bottom 2 cards are peeked during peeking phase
                  const isBeingPeeked = peekedAt?.seat === mySeat && peekedAt.idx === i;
                  const canClick = isMyTurn && (mode === 'drawn' || mode === 'use-peek' || mode === 'use-blind-my' || mode === 'use-seen-my');
                  const isSelected = myCardSel === i;

                  return (
                    <MPCardView
                      key={c?.id ?? i}
                      card={c ?? undefined}
                      size="md"
                      faceDown={false} // Server always sends our own card values
                      glow={isSelected || isBeingPeeked || (isPeeking && isBottom) || (mode === 'drawn' && isMyTurn)}
                      flash={flashIdx === i}
                      dimmed={isPeeking && !isBottom}
                      clickable={canClick}
                      label={
                        isBeingPeeked ? '👁 PEEK'
                        : isPeeking && isBottom ? '👁'
                        : flashIdx === i ? '🔄'
                        : undefined
                      }
                      onClick={canClick ? () => {
                        if (mode === 'drawn') { flash(i); swapDrawn(i); setMode('idle'); }
                        else if (mode === 'use-peek') { peekCard(i).then(() => { peek(mySeat!, i); }); setMode('idle'); }
                        else if (mode === 'use-blind-my') { setMyCardSel(i); setMode('use-blind-opp'); }
                        else if (mode === 'use-seen-my') { setMyCardSel(i); setMode('use-seen-opp'); }
                      } : undefined}
                    />
                  );
                })}
              </div>

              {/* CABO button */}
              {isMyTurn && !drawnCard && isPlaying && !game.cabo_called && (
                <button className="cabo-call-btn mt-2" onClick={callCabo}>📢 CABO</button>
              )}
            </div>
          </div>

        </div>{/* table-layout */}

        {/* ── Round badge ── */}
        <div className="round-badge">
          Round <span className="round-badge-num">{game.current_round}</span>/10
        </div>

        {/* ── Action log ── */}
        <div className="action-log">
          {actionLog.slice(-6).map((entry, i, arr) => (
            <div key={i} className="action-log-entry" style={{ opacity: 0.35 + (i / arr.length) * 0.65 }}>
              {entry}
            </div>
          ))}
        </div>

        {/* ── Leave button ── */}
        <button className="mp-leave-btn" onClick={async () => { await leaveGame(); onLeave(); }}>
          ← Leave
        </button>

        {/* ── Round/Game End overlay ── */}
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
                <button className="btn btn-ghost w-full" onClick={async () => { await leaveGame(); onLeave(); }}>
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
