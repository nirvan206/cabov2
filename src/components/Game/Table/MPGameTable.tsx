import React, { useEffect, useState, useRef } from 'react';
import { useMPStore, MPCard, MPPlayer } from '../../../store/mpStore';

// ── Helpers ──────────────────────────────────────────────────────
const RANK: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const SUIT_SYM: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const RED = ['hearts', 'diamonds'];

const rank = (v: number | null) => v === null ? '?' : (RANK[v] ?? String(v));
const suit = (s: string | null) => s ? (SUIT_SYM[s] ?? s) : '';
const isRed = (s: string | null) => s ? RED.includes(s) : false;

const specialName = (v: number | null) => {
  if (!v) return null;
  if (v === 7 || v === 8) return 'Peek Own Card';
  if (v === 9 || v === 10) return 'Spy Opponent';
  if (v === 11) return 'Blind Swap';
  if (v >= 12) return 'Seen Swap';
  return null;
};

// ── Card components ───────────────────────────────────────────────
interface CardProps {
  card?: MPCard;
  faceDown?: boolean;
  small?: boolean;
  highlighted?: boolean;
  glowing?: boolean;
  dimmed?: boolean;
  peeked?: boolean;
  swapped?: boolean;
  onClick?: () => void;
  label?: string;
}

const Card: React.FC<CardProps> = ({
  card, faceDown, small, highlighted, glowing, dimmed, peeked, swapped, onClick, label
}) => {
  const hidden = faceDown || !card || card.value === null;
  const cls = [
    'mpc',
    small ? 'mpc-sm' : 'mpc-lg',
    hidden ? 'mpc-back' : (isRed(card?.suit ?? null) ? 'mpc-red' : 'mpc-black'),
    highlighted ? 'mpc-highlighted' : '',
    glowing ? 'mpc-glowing' : '',
    dimmed ? 'mpc-dimmed' : '',
    peeked ? 'mpc-peeked' : '',
    swapped ? 'mpc-swapped' : '',
    onClick ? 'mpc-clickable' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} onClick={onClick}>
      {label && <div className="mpc-label">{label}</div>}
      {hidden ? (
        <div className="mpc-back-inner">🂠</div>
      ) : (
        <>
          <span className="mpc-tl">{rank(card!.value)}<br />{suit(card!.suit)}</span>
          <span className="mpc-center">{suit(card!.suit)}</span>
          <span className="mpc-br">{rank(card!.value)}<br />{suit(card!.suit)}</span>
        </>
      )}
    </div>
  );
};

// ── Main MPGameTable ──────────────────────────────────────────────
interface MPGameTableProps {
  gameId: string;
  onLeave: () => void;
}

type UIMode =
  | 'idle'
  | 'drawn'           // card drawn, pick action
  | 'use-peek'        // 7/8: click own card to peek
  | 'use-spy'         // 9/10: click opponent card to spy
  | 'use-blind-my'    // J: pick your card first
  | 'use-blind-opp'   // J: now pick opponent card
  | 'use-seen-my'     // Q/K: pick your card first
  | 'use-seen-opp';   // Q/K: now pick opponent card

export const MPGameTable: React.FC<MPGameTableProps> = ({ gameId, onLeave }) => {
  const {
    game, players, cards, actionLog, drawnCard, mySeat, loading, error, setError,
    loadGameState, drawCard, keepCard, swapDrawn, peekCard, spyCard,
    blindSwap, swapWithPeek, callCabo, nextRound, leaveGame,
  } = useMPStore();

  const [mode, setMode] = useState<UIMode>('idle');
  const [myCardSel, setMyCardSel] = useState<number | null>(null);
  const [oppSeatSel, setOppSeatSel] = useState<number | null>(null);
  const [swappedIdx, setSwappedIdx] = useState<number | null>(null);    // flash animation
  const [peekedIdx, setPeekedIdx] = useState<{ seat: number; idx: number } | null>(null);
  const [peekCountdown, setPeekCountdown] = useState(7);
  const peekTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load + poll ─────────────────────────────────────────────────
  useEffect(() => {
    loadGameState(gameId);
    const iv = setInterval(() => loadGameState(gameId), 4000);
    return () => clearInterval(iv);
  }, [gameId]);

  // ── Reset mode when drawnCard changes ───────────────────────────
  useEffect(() => {
    if (!drawnCard) { setMode('idle'); setMyCardSel(null); setOppSeatSel(null); }
    else setMode('drawn');
  }, [drawnCard?.id]);

  // ── Peek phase countdown ─────────────────────────────────────────
  useEffect(() => {
    if (game?.phase === 'peeking') {
      setPeekCountdown(7);
      peekTimer.current = setInterval(() => {
        setPeekCountdown(p => {
          if (p <= 1) { clearInterval(peekTimer.current!); return 0; }
          return p - 1;
        });
      }, 1000);
    } else {
      if (peekTimer.current) clearInterval(peekTimer.current);
    }
    return () => { if (peekTimer.current) clearInterval(peekTimer.current); };
  }, [game?.phase]);

  // ── Swap flash ───────────────────────────────────────────────────
  const flashSwap = (idx: number) => {
    setSwappedIdx(idx);
    setTimeout(() => setSwappedIdx(null), 1200);
  };

  // ── Peek flash ───────────────────────────────────────────────────
  const flashPeek = (seat: number, idx: number, duration = 3000) => {
    setPeekedIdx({ seat, idx });
    setTimeout(() => setPeekedIdx(null), duration);
  };

  if (!game) {
    return (
      <div className="mpt-loading">
        <div className="splash-spinner" />
        <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 16 }}>Loading game…</p>
      </div>
    );
  }

  // ── Derived state ────────────────────────────────────────────────
  const isMyTurn = game.current_turn_seat === mySeat;
  const phase = game.phase;
  const isPeeking = phase === 'peeking';
  const isPlaying = phase === 'playing';
  const isRoundEnd = phase === 'round_end';
  const isGameEnd = phase === 'game_end';

  const myCards = cards
    .filter(c => c.owner_seat === mySeat && c.location === 'hand')
    .sort((a, b) => (a.hand_index ?? 0) - (b.hand_index ?? 0));

  const deckCards = cards.filter(c => c.location === 'deck');
  const discardCards = cards.filter(c => c.location === 'discard');
  const topDiscard = discardCards[discardCards.length - 1] ?? null;
  const opponents = players.filter(p => p.seat_index !== mySeat);
  const me = players.find(p => p.seat_index === mySeat);
  const activePlayer = players.find(p => p.seat_index === game.current_turn_seat);

  const drawnSpecial = specialName(drawnCard?.value ?? null);

  // ── Action handlers ──────────────────────────────────────────────
  const handleDraw = async () => {
    if (!isMyTurn || drawnCard || !isPlaying) return;
    await drawCard();
  };

  const handleDiscard = async () => {
    await keepCard();
    setMode('idle');
  };

  const handleSwapMyCard = async (idx: number) => {
    flashSwap(idx);
    await swapDrawn(idx);
    setMode('idle');
  };

  // Peek ability (7/8): click own card
  const handlePeekCard = async (idx: number) => {
    await peekCard(idx);
    flashPeek(mySeat!, idx, 3000);
    setMode('idle');
    // discard the drawn card too
    await keepCard();
  };

  // Spy ability (9/10): click opponent card
  const handleSpyCard = async (oppSeat: number, idx: number) => {
    await spyCard(oppSeat, idx);
    flashPeek(oppSeat, idx, 3000);
    setMode('idle');
    await keepCard();
  };

  // Blind swap (J): my card selected, now pick opponent
  const handleBlindSwapConfirm = async (oppSeat: number, oppIdx: number) => {
    flashSwap(myCardSel!);
    await blindSwap(myCardSel!, oppSeat, oppIdx);
    setMode('idle'); setMyCardSel(null); setOppSeatSel(null);
    await keepCard();
  };

  // Seen swap (Q/K): my card selected, now pick opponent
  const handleSeenSwapConfirm = async (oppSeat: number, oppIdx: number) => {
    flashPeek(mySeat!, myCardSel!, 2000);
    flashPeek(oppSeat, oppIdx, 2000);
    setTimeout(async () => {
      flashSwap(myCardSel!);
      await swapWithPeek(myCardSel!, oppSeat, oppIdx);
      setMode('idle'); setMyCardSel(null); setOppSeatSel(null);
      await keepCard();
    }, 2100);
  };

  const handleCabo = async () => {
    await callCabo();
  };

  const handleLeave = async () => {
    await leaveGame();
    onLeave();
  };

  const handleNextRound = async () => {
    await nextRound();
  };

  // ── My card click logic (context-dependent) ───────────────────────
  const handleMyCardClick = (idx: number) => {
    if (mode === 'drawn') { handleSwapMyCard(idx); return; }
    if (mode === 'use-peek') { handlePeekCard(idx); return; }
    if (mode === 'use-blind-my') { setMyCardSel(idx); setMode('use-blind-opp'); return; }
    if (mode === 'use-seen-my') { setMyCardSel(idx); setMode('use-seen-opp'); return; }
  };

  // ── Opponent card click logic ────────────────────────────────────
  const handleOppCardClick = (seat: number, idx: number) => {
    if (mode === 'use-spy') { handleSpyCard(seat, idx); return; }
    if (mode === 'use-blind-opp') { handleBlindSwapConfirm(seat, idx); return; }
    if (mode === 'use-seen-opp') { handleSeenSwapConfirm(seat, idx); return; }
  };

  // ── Instruction bar text ─────────────────────────────────────────
  const instrText = () => {
    if (mode === 'drawn' && !drawnSpecial) return 'Click one of your cards to swap — or discard';
    if (mode === 'drawn' && drawnSpecial) return `Click a card to swap it in — or use ability: ${drawnSpecial}`;
    if (mode === 'use-peek') return '👁 Click one of YOUR cards to peek at it (3 sec)';
    if (mode === 'use-spy') return '👁 Click an OPPONENT\'S card to spy on it (3 sec)';
    if (mode === 'use-blind-my') return '🔀 Click YOUR card to swap out';
    if (mode === 'use-blind-opp') return '🔀 Now click the OPPONENT\'S card to swap with';
    if (mode === 'use-seen-my') return '🔀 Click YOUR card to swap out';
    if (mode === 'use-seen-opp') return '🔀 Now click the OPPONENT\'S card to swap with';
    if (isMyTurn && isPlaying && !drawnCard) return '⬇️ Click the deck to draw a card — or call CABO';
    return '';
  };

  return (
    <div className="mpt-root">

      {/* ── Top bar ── */}
      <div className="mpt-topbar">
        <div className="mpt-topbar-left">
          <span className="mpt-round">Round {game.current_round}/10</span>
          {game.cabo_called && <span className="mpt-cabo-alert">🚨 CABO!</span>}
        </div>
        <div className="mpt-topbar-center">
          {isPeeking
            ? <span className="mpt-phase-badge peeking">👀 Peek phase — {peekCountdown}s</span>
            : isMyTurn
              ? <span className="mpt-phase-badge myturn">⭐ Your Turn</span>
              : <span className="mpt-phase-badge waiting">
                  {activePlayer?.username ?? '...'}'s turn
                </span>
          }
        </div>
        <div className="mpt-topbar-right">
          <button className="btn btn-ghost btn-sm" onClick={handleLeave}>← Leave</button>
        </div>
      </div>

      {/* ── Error bar ── */}
      {error && (
        <div className="mpt-error">⚠️ {error} <button onClick={() => setError(null)}>✕</button></div>
      )}

      {/* ── Instruction bar ── */}
      {instrText() && (
        <div className="mpt-instruction">{instrText()}</div>
      )}

      {/* ── End overlays ── */}
      {(isRoundEnd || isGameEnd) && (
        <div className="mpt-end-overlay">
          <div className="mpt-end-card">
            <div className="mpt-end-title">{isGameEnd ? '🏆 Game Over!' : '🃏 Round Over!'}</div>
            <div className="mpt-end-scores">
              {[...players].sort((a, b) => a.total_score - b.total_score).map((p, i) => (
                <div key={p.id} className={`mpt-score-row ${i === 0 ? 'winner' : ''}`}>
                  <span>{i === 0 ? '🥇 ' : `${i + 1}. `}{p.username}{p.seat_index === mySeat ? ' (you)' : ''}</span>
                  <span className="mpt-score-val">{p.total_score} pts</span>
                </div>
              ))}
            </div>
            {isRoundEnd && me?.seat_index === 0 && (
              <button className="btn btn-green btn-lg w-full" onClick={handleNextRound} disabled={loading}>
                {loading ? '…' : '▶ Next Round'}
              </button>
            )}
            {isRoundEnd && me?.seat_index !== 0 && (
              <p className="mpt-waiting-msg">Waiting for host to start next round…</p>
            )}
            {isGameEnd && (
              <button className="btn btn-ghost w-full mt-2" onClick={handleLeave}>← Back to Lobby</button>
            )}
          </div>
        </div>
      )}

      {/* ── Table body ── */}
      <div className="mpt-body">

        {/* Opponents row */}
        <div className="mpt-opponents">
          {opponents.map(opp => {
            const oppCards = cards
              .filter(c => c.owner_seat === opp.seat_index && c.location === 'hand')
              .sort((a, b) => (a.hand_index ?? 0) - (b.hand_index ?? 0));
            const isOppTurn = game.current_turn_seat === opp.seat_index;
            const canClickOpp = mode === 'use-spy' || mode === 'use-blind-opp' || mode === 'use-seen-opp';

            return (
              <div key={opp.id} className={`mpt-opponent ${isOppTurn ? 'active' : ''}`}>
                <div className="mpt-opp-name">
                  {isOppTurn && <span className="mpt-active-dot" />}
                  {opp.username}
                  <span className="mpt-opp-score">{opp.total_score}pt</span>
                </div>
                <div className="mpt-cards-row">
                  {(oppCards.length > 0 ? oppCards : Array.from({ length: 4 }).map(() => null)).map((c, i) => {
                    const isPeekedHere = peekedIdx?.seat === opp.seat_index && peekedIdx.idx === i;
                    const clickable = canClickOpp && isMyTurn;
                    return (
                      <Card
                        key={c?.id ?? i}
                        card={c ?? undefined}
                        faceDown={!isPeekedHere}
                        small
                        highlighted={clickable}
                        glowing={clickable}
                        peeked={isPeekedHere}
                        onClick={clickable ? () => handleOppCardClick(opp.seat_index, i) : undefined}
                        label={isPeekedHere ? '👁' : undefined}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Center: deck + drawn + discard */}
        <div className="mpt-center">

          {/* Deck */}
          <div className="mpt-pile">
            <div className="mpt-pile-label">DECK · {deckCards.length}</div>
            <div
              className={`mpt-deck ${isMyTurn && !drawnCard && isPlaying ? 'clickable' : ''}`}
              onClick={handleDraw}
            >
              {deckCards.length > 0 ? <Card faceDown /> : <div className="mpt-empty">Empty</div>}
            </div>
            {isMyTurn && !drawnCard && isPlaying && (
              <div className="mpt-pile-hint">click</div>
            )}
          </div>

          {/* Drawn card + actions */}
          {drawnCard && isMyTurn && (
            <div className="mpt-drawn-area">
              <div className="mpt-pile-label">DRAWN</div>
              <Card card={drawnCard} glowing />
              <div className="mpt-drawn-btns">
                <button className="mpt-action-btn discard" onClick={handleDiscard}>
                  🗑 Discard
                </button>
                {drawnSpecial && (
                  <button
                    className="mpt-action-btn ability"
                    onClick={() => {
                      const v = drawnCard.value ?? 0;
                      if (v === 7 || v === 8) setMode('use-peek');
                      else if (v === 9 || v === 10) setMode('use-spy');
                      else if (v === 11) { setMode('use-blind-my'); }
                      else if (v >= 12) { setMode('use-seen-my'); }
                    }}
                  >
                    ✨ {drawnSpecial}
                  </button>
                )}
              </div>
              <div className="mpt-drawn-hint">or click your card to swap ↓</div>
            </div>
          )}

          {/* Discard */}
          <div className="mpt-pile">
            <div className="mpt-pile-label">DISCARD</div>
            <div className="mpt-discard">
              {topDiscard ? <Card card={topDiscard} /> : <div className="mpt-empty">Empty</div>}
            </div>
          </div>
        </div>

        {/* Action log */}
        <div className="mpt-log">
          {[...actionLog].reverse().slice(0, 7).reverse().map((msg, i) => (
            <div key={i} className="mpt-log-entry">
              <span className="mpt-log-dot">·</span> {msg}
            </div>
          ))}
        </div>

        {/* My hand */}
        <div className="mpt-my-area">
          <div className="mpt-my-label">
            <span>{me?.username ?? 'You'}</span>
            <span className="mpt-my-score">{me?.total_score ?? 0} pts</span>
          </div>
          <div className="mpt-cards-row mpt-my-cards">
            {myCards.map((c, i) => {
              // Bottom 2 cards (index 2,3) are glowing during peek phase
              const isBottomTwo = i >= 2;
              const isSwapTarget = mode === 'drawn';
              const isPeekTarget = mode === 'use-peek';
              const isBlindPick = mode === 'use-blind-my' || mode === 'use-seen-my';
              const clickable = isMyTurn && (isSwapTarget || isPeekTarget || isBlindPick);
              const isJustSwapped = swappedIdx === i;
              const isBeingPeeked = peekedIdx?.seat === mySeat && peekedIdx.idx === i;

              return (
                <div key={c.id} className="mpt-my-card-wrap">
                  <Card
                    card={c}
                    highlighted={clickable || isJustSwapped}
                    glowing={(isPeeking && isBottomTwo) || isJustSwapped || isBeingPeeked}
                    swapped={isJustSwapped}
                    peeked={isBeingPeeked}
                    dimmed={isPeeking && !isBottomTwo}
                    onClick={clickable ? () => handleMyCardClick(i) : undefined}
                    label={
                      isPeeking && isBottomTwo ? '👁 PEEK'
                      : isJustSwapped ? '🔄'
                      : isBeingPeeked ? '👁'
                      : undefined
                    }
                  />
                  <div className="mpt-card-idx">{i + 1}</div>
                </div>
              );
            })}
            {myCards.length === 0 && Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="mpt-my-card-wrap">
                <Card faceDown />
                <div className="mpt-card-idx">{i + 1}</div>
              </div>
            ))}
          </div>

          {/* CABO button */}
          {isMyTurn && !drawnCard && isPlaying && !game.cabo_called && (
            <button className="mpt-cabo-btn" onClick={handleCabo}>
              📢 Call CABO
            </button>
          )}

          {/* Cancel ability */}
          {(mode === 'use-peek' || mode === 'use-spy' || mode === 'use-blind-my' || mode === 'use-blind-opp' || mode === 'use-seen-my' || mode === 'use-seen-opp') && (
            <button className="mpt-cancel-btn" onClick={() => { setMode('drawn'); setMyCardSel(null); }}>
              ✕ Cancel ability
            </button>
          )}
        </div>

      </div>{/* end mpt-body */}
    </div>
  );
};
