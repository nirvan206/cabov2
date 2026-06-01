import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { dealRound, advanceTurn, discardDrawnCard, refreshDeckIfEmpty, maskStateForPlayer, logAction } from './gameLogic.js';
const PORT = parseInt(process.env.PORT || '8080', 10);
const envPath = path.join(process.cwd(), '../.env');
let supabaseUrl = process.env.VITE_SUPABASE_URL || '';
let supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim();
            if (key === 'VITE_SUPABASE_URL')
                supabaseUrl = val;
            if (key === 'VITE_SUPABASE_ANON_KEY')
                supabaseKey = val;
        }
    });
}
const rooms = new Map();
const clients = new Map();
const turnTimers = new Map();
const idleTimers = new Map();
const rateLimit = new Map();
const wss = new WebSocketServer({ port: PORT });
wss.on('connection', (ws) => {
    ws.on('message', async (data) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'join') {
                await handleJoin(ws, msg.gameId, msg.token);
            }
            else {
                await handleAction(ws, msg);
            }
        }
        catch (e) {
            ws.send(JSON.stringify({ type: 'error', data: { message: e.message } }));
        }
    });
    ws.on('close', () => {
        handleDisconnect(ws);
    });
});
async function verifyToken(token) {
    const url = `${supabaseUrl}/auth/v1/user`;
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': supabaseKey
        }
    });
    if (!res.ok)
        throw new Error('Invalid token');
    return res.json();
}
async function handleJoin(ws, gameId, token) {
    const user = await verifyToken(token);
    const raw = (user.user_metadata?.full_name || user.user_metadata?.name || 'player').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const username = `${raw.slice(0, 10)}_${user.id.slice(0, 4)}`;
    let game = rooms.get(gameId);
    if (!game) {
        game = {
            id: gameId,
            status: 'waiting',
            phase: 'lobby',
            max_players: 4,
            current_round: 1,
            current_turn_seat: 0,
            cabo_called: false,
            cabo_caller_seat: null,
            players: [],
            cards: [],
            actionLog: []
        };
        rooms.set(gameId, game);
    }
    resetIdleTimeout(gameId);
    let p = game.players.find(x => x.id === user.id);
    let seat = p ? p.seat_index : -1;
    if (!p) {
        if (game.status !== 'waiting')
            throw new Error('Game already started');
        if (game.players.length >= game.max_players)
            throw new Error('Game full');
        seat = game.players.length;
        p = {
            id: user.id,
            username,
            avatar_url: user.user_metadata?.avatar_url || null,
            seat_index: seat,
            is_ready: false,
            total_score: 0,
            round_scores: []
        };
        game.players.push(p);
        logAction(game, seat, `${username} joined the lobby`);
    }
    clients.set(ws, { gameId, seatIndex: seat, userId: user.id, username });
    broadcastState(gameId);
}
function handleDisconnect(ws) {
    const client = clients.get(ws);
    if (!client)
        return;
    clients.delete(ws);
    rateLimit.delete(ws);
    const game = rooms.get(client.gameId);
    if (!game)
        return;
    if (game.status === 'waiting') {
        game.players = game.players.filter(p => p.id !== client.userId);
        game.players.forEach((p, idx) => { p.seat_index = idx; });
        logAction(game, client.seatIndex, `${client.username} left the lobby`);
        if (game.players.length === 0) {
            destroyRoom(client.gameId);
        }
        else {
            broadcastState(client.gameId);
        }
    }
    else {
        logAction(game, client.seatIndex, `${client.username} disconnected`);
        setTimeout(() => {
            const stillGone = !Array.from(clients.values()).some(c => c.userId === client.userId && c.gameId === client.gameId);
            if (stillGone && game.status !== 'finished') {
                handlePlayerTimeout(client.gameId, client.seatIndex);
            }
        }, 15000);
    }
}
function handlePlayerTimeout(gameId, seatIndex) {
    const game = rooms.get(gameId);
    if (!game)
        return;
    logAction(game, seatIndex, `Player timed out. Terminating game...`);
    game.phase = 'terminated';
    game.status = 'finished';
    broadcastState(gameId);
    destroyRoom(gameId);
}
async function handleAction(ws, msg) {
    const client = clients.get(ws);
    if (!client)
        throw new Error('Not joined');
    const now = Date.now();
    const lastAction = rateLimit.get(ws) || 0;
    if (now - lastAction < 500)
        throw new Error('Rate limit exceeded');
    rateLimit.set(ws, now);
    const game = rooms.get(client.gameId);
    if (!game)
        throw new Error('Room not found');
    resetIdleTimeout(client.gameId);
    switch (msg.type) {
        case 'ready':
            const p = game.players.find(x => x.seat_index === client.seatIndex);
            if (p)
                p.is_ready = !p.is_ready;
            break;
        case 'start':
            if (client.seatIndex !== 0)
                throw new Error('Only host can start');
            if (game.players.length < 2)
                throw new Error('Need at least 2 players');
            dealRound(game);
            startPeekingTimer(client.gameId);
            break;
        case 'draw':
            verifyTurn(game, client.seatIndex);
            if (game.cards.some(c => c.owner_seat === client.seatIndex && c.hand_index === 99))
                throw new Error('Already drawn');
            refreshDeckIfEmpty(game);
            const deckIdx = game.cards.findIndex(c => c.location === 'deck');
            if (deckIdx === -1)
                throw new Error('No cards');
            const card = game.cards[deckIdx];
            card.location = 'hand';
            card.owner_seat = client.seatIndex;
            card.hand_index = 99;
            logAction(game, client.seatIndex, `Seat ${client.seatIndex} drew a card`);
            startTurnTimer(client.gameId);
            break;
        case 'swapDrawn':
            verifyTurn(game, client.seatIndex);
            const handCard = game.cards.find(c => c.owner_seat === client.seatIndex && c.hand_index === msg.handIndex && c.location === 'hand');
            const drawn = game.cards.find(c => c.owner_seat === client.seatIndex && c.hand_index === 99);
            if (!handCard || !drawn)
                throw new Error('Card not found');
            drawn.location = 'hand';
            drawn.hand_index = msg.handIndex;
            handCard.location = 'discard_down';
            handCard.owner_seat = null;
            handCard.hand_index = null;
            handCard.face_up = false;
            logAction(game, client.seatIndex, `Seat ${client.seatIndex} swapped with card ${msg.handIndex + 1}`);
            advanceTurn(game);
            startTurnTimer(client.gameId);
            break;
        case 'keepDiscard':
            verifyTurn(game, client.seatIndex);
            const toDiscard = game.cards.find(c => c.owner_seat === client.seatIndex && c.hand_index === 99);
            if (!toDiscard)
                throw new Error('No drawn card');
            discardDrawnCard(game, client.seatIndex, false);
            logAction(game, client.seatIndex, `Seat ${client.seatIndex} discarded without ability`);
            advanceTurn(game);
            startTurnTimer(client.gameId);
            break;
        case 'peek':
            verifyTurn(game, client.seatIndex);
            const peekDrawn = game.cards.find(c => c.owner_seat === client.seatIndex && c.hand_index === 99);
            if (!peekDrawn || (peekDrawn.value !== 6 && peekDrawn.value !== 7))
                throw new Error('Invalid ability usage');
            const peekCard = game.cards.find(c => c.owner_seat === client.seatIndex && c.hand_index === msg.cardIndex && c.location === 'hand');
            if (!peekCard)
                throw new Error('Card not found');
            discardDrawnCard(game, client.seatIndex, true);
            logAction(game, client.seatIndex, `Seat ${client.seatIndex} peeked at their card ${msg.cardIndex + 1}`);
            ws.send(JSON.stringify({ type: 'cardReveal', data: { seat: client.seatIndex, cardIndex: msg.cardIndex, value: peekCard.value, suit: peekCard.suit } }));
            advanceTurn(game);
            startTurnTimer(client.gameId);
            break;
        case 'spy':
            verifyTurn(game, client.seatIndex);
            const spyDrawn = game.cards.find(c => c.owner_seat === client.seatIndex && c.hand_index === 99);
            if (!spyDrawn || (spyDrawn.value !== 8 && spyDrawn.value !== 9))
                throw new Error('Invalid ability usage');
            if (game.cabo_called && game.cabo_caller_seat === msg.targetSeat)
                throw new Error('Locked');
            const spyCard = game.cards.find(c => c.owner_seat === msg.targetSeat && c.hand_index === msg.cardIndex && c.location === 'hand');
            if (!spyCard)
                throw new Error('Card not found');
            discardDrawnCard(game, client.seatIndex, true);
            logAction(game, client.seatIndex, `Seat ${client.seatIndex} spied on Seat ${msg.targetSeat}'s card ${msg.cardIndex + 1}`);
            ws.send(JSON.stringify({ type: 'cardReveal', data: { seat: msg.targetSeat, cardIndex: msg.cardIndex, value: spyCard.value, suit: spyCard.suit } }));
            advanceTurn(game);
            startTurnTimer(client.gameId);
            break;
        case 'blindSwap':
            verifyTurn(game, client.seatIndex);
            const bsDrawn = game.cards.find(c => c.owner_seat === client.seatIndex && c.hand_index === 99);
            if (!bsDrawn || (bsDrawn.value !== 10 && bsDrawn.value !== 11))
                throw new Error('Invalid ability usage');
            if (game.cabo_called && game.cabo_caller_seat === msg.targetSeat)
                throw new Error('Locked');
            const myCard = game.cards.find(c => c.owner_seat === client.seatIndex && c.hand_index === msg.myIndex && c.location === 'hand');
            const targetCard = game.cards.find(c => c.owner_seat === msg.targetSeat && c.hand_index === msg.targetIndex && c.location === 'hand');
            if (!myCard || !targetCard)
                throw new Error('Card not found');
            broadcastToRoom(client.gameId, { type: 'swapAnim', data: { seat1: client.seatIndex, idx1: msg.myIndex, seat2: msg.targetSeat, idx2: msg.targetIndex } });
            setTimeout(() => {
                myCard.owner_seat = msg.targetSeat;
                myCard.hand_index = msg.targetIndex;
                targetCard.owner_seat = client.seatIndex;
                targetCard.hand_index = msg.myIndex;
                discardDrawnCard(game, client.seatIndex, true);
                logAction(game, client.seatIndex, `Seat ${client.seatIndex} blind-swapped with Seat ${msg.targetSeat}`);
                advanceTurn(game);
                startTurnTimer(client.gameId);
                broadcastState(client.gameId);
            }, 500);
            return;
        case 'swapWithPeek':
            verifyTurn(game, client.seatIndex);
            const swDrawn = game.cards.find(c => c.owner_seat === client.seatIndex && c.hand_index === 99);
            if (!swDrawn || swDrawn.value < 12)
                throw new Error('Invalid ability usage');
            if (game.cabo_called && game.cabo_caller_seat === msg.targetSeat)
                throw new Error('Locked');
            const sMyCard = game.cards.find(c => c.owner_seat === client.seatIndex && c.hand_index === msg.myIndex && c.location === 'hand');
            const sTargetCard = game.cards.find(c => c.owner_seat === msg.targetSeat && c.hand_index === msg.targetIndex && c.location === 'hand');
            if (!sMyCard || !sTargetCard)
                throw new Error('Card not found');
            if (msg.phase === 'reveal') {
                ws.send(JSON.stringify({ type: 'peekReveal', data: { myVal: sMyCard.value, mySuit: sMyCard.suit, targetVal: sTargetCard.value, targetSuit: sTargetCard.suit } }));
            }
            else {
                broadcastToRoom(client.gameId, { type: 'swapAnim', data: { seat1: client.seatIndex, idx1: msg.myIndex, seat2: msg.targetSeat, idx2: msg.targetIndex } });
                setTimeout(() => {
                    sMyCard.owner_seat = msg.targetSeat;
                    sMyCard.hand_index = msg.targetIndex;
                    sTargetCard.owner_seat = client.seatIndex;
                    sTargetCard.hand_index = msg.myIndex;
                    discardDrawnCard(game, client.seatIndex, true);
                    logAction(game, client.seatIndex, `Seat ${client.seatIndex} used seen-swap with Seat ${msg.targetSeat}`);
                    advanceTurn(game);
                    startTurnTimer(client.gameId);
                    broadcastState(client.gameId);
                }, 500);
            }
            break;
        case 'callCabo':
            verifyTurn(game, client.seatIndex);
            if (game.cabo_called)
                throw new Error('Cabo already called');
            if (game.cards.some(c => c.owner_seat === client.seatIndex && c.hand_index === 99))
                throw new Error('Must call before draw');
            game.cabo_called = true;
            game.cabo_caller_seat = client.seatIndex;
            logAction(game, client.seatIndex, `📢 Seat ${client.seatIndex} called CABO!`);
            advanceTurn(game);
            startTurnTimer(client.gameId);
            break;
        case 'nextRound':
            if (game.phase !== 'round_end')
                throw new Error('Round not over');
            game.current_round += 1;
            if (game.current_round > 10) {
                game.phase = 'game_end';
                game.status = 'finished';
            }
            else {
                dealRound(game);
                startPeekingTimer(client.gameId);
            }
            break;
        case 'endPeeking':
            if (game.phase === 'peeking') {
                game.phase = 'playing';
                startTurnTimer(client.gameId);
            }
            break;
        case 'leave':
            handleDisconnect(ws);
            break;
    }
    broadcastState(client.gameId);
}
function verifyTurn(game, seat) {
    if (game.phase !== 'playing')
        throw new Error('Not in playing phase');
    if (game.current_turn_seat !== seat)
        throw new Error('Not your turn');
}
function startPeekingTimer(gameId) {
    clearTurnTimer(gameId);
    const timer = setTimeout(() => {
        const game = rooms.get(gameId);
        if (game && game.phase === 'peeking') {
            game.phase = 'playing';
            startTurnTimer(gameId);
            broadcastState(gameId);
        }
    }, 7500);
    turnTimers.set(gameId, timer);
}
function startTurnTimer(gameId) {
    clearTurnTimer(gameId);
    const timer = setTimeout(() => {
        const game = rooms.get(gameId);
        if (!game || game.phase !== 'playing')
            return;
        const currentSeat = game.current_turn_seat;
        logAction(game, currentSeat, `Turn timeout for Seat ${currentSeat}`);
        const drawn = game.cards.find(c => c.owner_seat === currentSeat && c.hand_index === 99);
        if (drawn) {
            discardDrawnCard(game, currentSeat, false);
        }
        advanceTurn(game);
        startTurnTimer(gameId);
        broadcastState(gameId);
    }, 30000);
    turnTimers.set(gameId, timer);
}
function clearTurnTimer(gameId) {
    const timer = turnTimers.get(gameId);
    if (timer) {
        clearTimeout(timer);
        turnTimers.delete(gameId);
    }
}
function resetIdleTimeout(gameId) {
    const old = idleTimers.get(gameId);
    if (old)
        clearTimeout(old);
    const timer = setTimeout(() => {
        destroyRoom(gameId);
    }, 30 * 60 * 1000);
    idleTimers.set(gameId, timer);
}
function destroyRoom(gameId) {
    clearTurnTimer(gameId);
    const idle = idleTimers.get(gameId);
    if (idle)
        clearTimeout(idle);
    idleTimers.delete(gameId);
    rooms.delete(gameId);
    broadcastToRoom(gameId, { type: 'terminated' });
}
function broadcastToRoom(gameId, msg) {
    const data = JSON.stringify(msg);
    Array.from(clients.entries()).forEach(([ws, client]) => {
        if (client.gameId === gameId && ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    });
}
function broadcastState(gameId) {
    const game = rooms.get(gameId);
    if (!game)
        return;
    Array.from(clients.entries()).forEach(([ws, client]) => {
        if (client.gameId === gameId && ws.readyState === WebSocket.OPEN) {
            const masked = maskStateForPlayer(game, client.seatIndex);
            ws.send(JSON.stringify({ type: 'stateUpdate', data: masked }));
        }
    });
}
