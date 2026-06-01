const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
export function createId() {
    return Math.random().toString(36).substring(2, 15);
}
export function logAction(game, seat, message) {
    game.actionLog.push(message);
    if (game.actionLog.length > 20) {
        game.actionLog.shift();
    }
}
export function maskCard(c, seat, phase) {
    if (phase === 'round_end' || phase === 'game_end') {
        return c;
    }
    if (c.location === 'hand') {
        const isOwnCard = seat !== null && c.owner_seat === seat;
        const reveal = isOwnCard && phase === 'peeking' && c.hand_index !== null && c.hand_index >= 2;
        if (!reveal && !c.face_up) {
            return { ...c, value: 0, suit: '' };
        }
    }
    if (c.location === 'deck' || c.location === 'discard_down') {
        return { ...c, value: 0, suit: '' };
    }
    return c;
}
export function maskStateForPlayer(game, seat) {
    return {
        ...game,
        cards: game.cards.map(c => maskCard(c, seat, game.phase))
    };
}
export function createDeck(numDecks) {
    const cards = [];
    for (let d = 0; d < numDecks; d++) {
        for (const suit of SUITS) {
            for (let value = 1; value <= 13; value++) {
                cards.push({
                    id: createId(),
                    value,
                    suit,
                    location: 'deck',
                    hand_index: null,
                    face_up: false,
                    owner_seat: null,
                });
            }
        }
    }
    return shuffle(cards);
}
function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
export function dealRound(game) {
    game.cards = createDeck(game.max_players > 4 ? 3 : 2);
    let cardIdx = 0;
    for (let i = 0; i < 4; i++) {
        for (const p of game.players) {
            const card = game.cards[cardIdx++];
            card.location = 'hand';
            card.owner_seat = p.seat_index;
            card.hand_index = i;
        }
    }
    for (let i = 0; i < game.cards.length; i++) {
        if (game.cards[i].location === 'deck') {
            game.cards[i].hand_index = i - cardIdx;
        }
    }
    game.phase = 'peeking';
    game.status = 'playing';
}
export function advanceTurn(game) {
    const seats = game.players.map(p => p.seat_index).sort((a, b) => a - b);
    const currentIdx = seats.indexOf(game.current_turn_seat);
    const nextSeat = seats[(currentIdx + 1) % seats.length];
    if (game.cabo_called && nextSeat === game.cabo_caller_seat) {
        endRound(game);
        return;
    }
    game.current_turn_seat = nextSeat;
}
export function discardDrawnCard(game, seat, usedAbility) {
    const idx = game.cards.findIndex(c => c.owner_seat === seat && c.hand_index === 99);
    if (idx === -1)
        return;
    const card = game.cards[idx];
    card.location = usedAbility ? 'discard_up' : 'discard_down';
    card.owner_seat = null;
    card.hand_index = null;
    card.face_up = usedAbility;
}
export function refreshDeckIfEmpty(game) {
    const hasDeck = game.cards.some(c => c.location === 'deck');
    if (hasDeck)
        return;
    const discards = game.cards.filter(c => c.location === 'discard_up' || c.location === 'discard_down');
    if (discards.length === 0)
        return;
    const shuffled = shuffle(discards);
    shuffled.forEach((c, idx) => {
        c.location = 'deck';
        c.owner_seat = null;
        c.face_up = false;
        c.hand_index = idx;
    });
}
export function endRound(game) {
    game.cards.forEach(c => {
        if (c.location === 'hand')
            c.face_up = true;
    });
    let lowestScore = Infinity;
    let roundWinnerSeat = game.players[0].seat_index;
    for (const p of game.players) {
        const pCards = game.cards.filter(c => c.owner_seat === p.seat_index && c.location === 'hand');
        const score = pCards.reduce((sum, c) => sum + c.value, 0);
        p.round_scores.push(score);
        p.total_score += score;
        if (score < lowestScore) {
            lowestScore = score;
            roundWinnerSeat = p.seat_index;
        }
    }
    const isGameEnd = game.current_round >= 10;
    game.phase = isGameEnd ? 'game_end' : 'round_end';
    game.status = isGameEnd ? 'finished' : 'round_end';
    game.current_turn_seat = roundWinnerSeat;
}
