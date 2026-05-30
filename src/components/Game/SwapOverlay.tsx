import React, { useEffect, useState } from 'react';
import { Card as GameCard } from '../../types/game';
import { Card } from './Card/Card';

export interface SwapAnimData {
  card1: GameCard;
  card2: GameCard;
  pos1: [number, number]; // [top%, left%] — card1 starts here
  pos2: [number, number]; // [top%, left%] — card2 starts here
  type: 'drawn' | 'blind' | 'seen';
  onComplete: () => void;
}

export const SwapOverlay: React.FC<{ anim: SwapAnimData | null }> = ({ anim }) => {
  const [phase, setPhase] = useState<'idle' | 'appear' | 'reveal' | 'slide' | 'settle'>('idle');

  useEffect(() => {
    if (!anim) { setPhase('idle'); return; }

    setPhase('appear');
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (anim.type === 'seen') {
      // Seen swap: appear → reveal (show cards) → slide → settle → complete
      timers.push(setTimeout(() => setPhase('reveal'), 300));
      timers.push(setTimeout(() => setPhase('slide'), 1800));
      timers.push(setTimeout(() => setPhase('settle'), 3400));
      timers.push(setTimeout(() => anim.onComplete(), 3700));
    } else {
      // Drawn / Blind: appear → slide → settle → complete
      timers.push(setTimeout(() => setPhase('slide'), 350));
      timers.push(setTimeout(() => setPhase('settle'), 2100));
      timers.push(setTimeout(() => anim.onComplete(), 2400));
    }

    return () => timers.forEach(clearTimeout);
  }, [anim]);

  if (!anim || phase === 'idle') return null;

  const sliding = phase === 'slide' || phase === 'settle';

  // Card visibility
  let c1FaceUp = false;
  let c2FaceUp = false;
  if (anim.type === 'drawn') {
    c1FaceUp = true; // drawn card always shown
  } else if (anim.type === 'seen') {
    c1FaceUp = phase === 'reveal' || phase === 'slide' || phase === 'settle';
    c2FaceUp = phase === 'reveal' || phase === 'slide' || phase === 'settle';
  }

  const slideTransition = 'top 1.6s cubic-bezier(0.22, 0.61, 0.36, 1), left 1.6s cubic-bezier(0.22, 0.61, 0.36, 1)';

  return (
    <div className="swap-anim-overlay">
      {/* Card 1: starts at pos1, slides to pos2 */}
      <div
        className={`swap-float-card ${phase === 'settle' ? 'settling' : ''}`}
        style={{
          top: sliding ? `${anim.pos2[0]}%` : `${anim.pos1[0]}%`,
          left: sliding ? `${anim.pos2[1]}%` : `${anim.pos1[1]}%`,
          transition: sliding ? slideTransition : 'none',
        }}
      >
        <Card card={{ ...anim.card1, faceUp: c1FaceUp }} size="medium" />
      </div>

      {/* Card 2: starts at pos2, slides to pos1 */}
      <div
        className={`swap-float-card ${phase === 'settle' ? 'settling' : ''}`}
        style={{
          top: sliding ? `${anim.pos1[0]}%` : `${anim.pos2[0]}%`,
          left: sliding ? `${anim.pos1[1]}%` : `${anim.pos2[1]}%`,
          transition: sliding ? slideTransition : 'none',
        }}
      >
        <Card card={{ ...anim.card2, faceUp: c2FaceUp }} size="medium" />
      </div>

      {/* Labels */}
      {anim.type === 'seen' && (phase === 'reveal') && (
        <div className="swap-label swap-label-seen">
          👀 Seen Swap — memorize the cards!
        </div>
      )}
      {anim.type === 'blind' && (phase === 'slide') && (
        <div className="swap-label">
          🔄 Blind Swap
        </div>
      )}
      {anim.type === 'drawn' && (phase === 'slide') && (
        <div className="swap-label">
          🔄 Swapping…
        </div>
      )}
    </div>
  );
};
