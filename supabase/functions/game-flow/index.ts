import { getUser, getServiceClient, getPlayerSeat, logAction, corsHeaders, ok, err, endRound, findPlayerSeat } from '../_shared/utils.ts';

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];

const createDeck = (numDecks: number) => {
  const cards = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (let value = 1; value <= 13; value++) {
        cards.push({ suit, value });
      }
    }
  }
  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const { type, game_id } = body;
    const supabase = getServiceClient();

    if (type === 'ping') {
      return ok({ message: 'pong' });
    }

    const user = await getUser(req);
    if (!game_id) throw new Error('game_id is required');

    if (type === 'start-game') {
      const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single();
      if (!game) throw new Error('Game not found');
      if (game.status !== 'waiting') throw new Error('Game already started');

      const { seat_index } = await getPlayerSeat(supabase, game_id, user.id);
      if (seat_index !== 0) throw new Error('Only host can start');

      const { data: players } = await supabase.from('game_players')
        .select('*').eq('game_id', game_id).order('seat_index');
      if (!players || players.length < 2) throw new Error('Need at least 2 players');

      // Delete any existing cards
      await supabase.from('cards').delete().eq('game_id', game_id);

      // Create shuffled deck
      const deck = createDeck(game.number_of_decks || 2);
      const cardInserts = deck.map((c, i) => ({
        game_id,
        suit: c.suit,
        value: c.value,
        location: 'deck',
        face_up: false,
        hand_index: i, // position in deck
        owner_seat: null,
      }));

      await supabase.from('cards').insert(cardInserts);

      // Deal 4 cards to each player
      const { data: deckCards } = await supabase.from('cards')
        .select('*').eq('game_id', game_id).eq('location', 'deck').order('hand_index');

      let cardIdx = 0;
      const cardUpdates = [];
      for (let i = 0; i < 4; i++) {
        for (const player of players) {
          const card = deckCards![cardIdx++];
          cardUpdates.push({
            ...card,
            location: 'hand',
            owner_seat: player.seat_index,
            hand_index: i,
            face_up: false,
          });
        }
      }

      await supabase.from('cards').upsert(cardUpdates);

      // Update game status
      await supabase.from('games').update({
        status: 'playing',
        phase: 'peeking',
        current_turn_seat: players[0].seat_index,
      }).eq('id', game_id);

      // Schedule peek phase end (pg_net RPC with fallback)
      try {
        await supabase.rpc('schedule_peek_timer', { game_id });
      } catch (e) {
        console.error("Failed to schedule peek timer via pg_net, using fallback setTimeout:", e);
        setTimeout(async () => {
          const backupSupabase = getServiceClient();
          await backupSupabase.from('games').update({ phase: 'playing' }).eq('id', game_id).eq('phase', 'peeking');
        }, 7000);
      }

      return ok({ message: 'Game started' });
    }

    if (type === 'next-round') {
      const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single();
      if (!game) throw new Error('Game not found');

      const newRound = game.current_round + 1;
      if (newRound > 10) throw new Error('Game over');

      const { data: players } = await supabase.from('game_players')
        .select('*').eq('game_id', game_id).order('seat_index');

      // Find round winner (lowest score in last round)
      let winnerSeat = players![0].seat_index;
      let lowestScore = Infinity;
      for (const p of players!) {
        const lastScore = p.round_scores?.[p.round_scores.length - 1] ?? Infinity;
        if (lastScore < lowestScore) { lowestScore = lastScore; winnerSeat = p.seat_index; }
      }

      // Delete old cards and deal new deck
      await supabase.from('cards').delete().eq('game_id', game_id);

      const deck = [];
      for (let d = 0; d < (game.number_of_decks || 2); d++) {
        for (const suit of SUITS) {
          for (let v = 1; v <= 13; v++) deck.push({ suit, value: v });
        }
      }
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }

      const cardInserts = deck.map((c, i) => ({ game_id, suit: c.suit, value: c.value, location: 'deck', face_up: false, hand_index: i, owner_seat: null }));
      await supabase.from('cards').insert(cardInserts);

      const { data: deckCards } = await supabase.from('cards')
        .select('*').eq('game_id', game_id).eq('location', 'deck').order('hand_index');

      let cardIdx = 0;
      const cardUpdates = [];
      for (let i = 0; i < 4; i++) {
        for (const player of players!) {
          const card = deckCards![cardIdx++];
          cardUpdates.push({
            ...card,
            location: 'hand',
            owner_seat: player.seat_index,
            hand_index: i,
            face_up: false,
          });
        }
      }

      await supabase.from('cards').upsert(cardUpdates);

      await supabase.from('games').update({
        current_round: newRound,
        current_turn_seat: winnerSeat,
        phase: 'peeking',
        status: 'playing',
        cabo_called: false,
        cabo_caller_seat: null,
      }).eq('id', game_id);

      // Schedule peek phase end (pg_net RPC with fallback)
      try {
        await supabase.rpc('schedule_peek_timer', { game_id });
      } catch (e) {
        console.error("Failed to schedule peek timer via pg_net, using fallback setTimeout:", e);
        setTimeout(async () => {
          const backupSupabase = getServiceClient();
          await backupSupabase.from('games').update({ phase: 'playing' }).eq('id', game_id).eq('phase', 'peeking');
        }, 7000);
      }

      await logAction(supabase, game_id, winnerSeat, `Round ${newRound} started!`);
      return ok({ message: 'Next round started' });
    }

    if (type === 'get-state') {
      // Get game — anyone can call get-state if they know the game_id
      const { data: game, error: gameErr } = await supabase
        .from('games').select('*').eq('id', game_id).single();
      if (gameErr || !game) throw new Error('Game not found');

      // Find caller's seat — returns -1 if not yet in game
      const seat_index = await findPlayerSeat(supabase, game_id, user.id);

      // Players
      const { data: players } = await supabase
        .from('game_players')
        .select('id, seat_index, player_id, total_score, round_scores, is_ready')
        .eq('game_id', game_id)
        .order('seat_index');

      // Enrich with profile data
      const playerIds = players?.map((p: any) => p.player_id) ?? [];
      const { data: profiles } = playerIds.length > 0
        ? await supabase.from('profiles').select('id, username, avatar_url').in('id', playerIds)
        : { data: [] };

      const enrichedPlayers = players?.map((p: any) => ({
        ...p,
        username: profiles?.find((pr: any) => pr.id === p.player_id)?.username ?? 'Unknown',
        avatar_url: profiles?.find((pr: any) => pr.id === p.player_id)?.avatar_url ?? null,
      })) ?? [];

      // Cards: Optimization (Phase 2) - reduce payload size by only returning hand cards,
      // top cards of deck, and top card of discard piles, along with skeleton deck cards.
      const { data: allCards } = await supabase
        .from('cards').select('*').eq('game_id', game_id);

      const handCards = allCards?.filter((c: any) => c.location === 'hand') ?? [];
      
      const deckCards = allCards?.filter((c: any) => c.location === 'deck').map((c: any) => ({
        id: c.id,
        location: 'deck',
        owner_seat: null,
        value: null,
        suit: null,
        hand_index: c.hand_index,
        face_up: false
      })) ?? [];

      const discardUp = allCards?.filter((c: any) => c.location === 'discard_up').sort((a: any, b: any) => a.created_at.localeCompare(b.created_at)) ?? [];
      const discardDown = allCards?.filter((c: any) => c.location === 'discard_down').sort((a: any, b: any) => a.created_at.localeCompare(b.created_at)) ?? [];
      
      const topDiscardUpCard = discardUp.length > 0 ? [discardUp[discardUp.length - 1]] : [];
      const topDiscardDownCard = discardDown.length > 0 ? [discardDown[discardDown.length - 1]] : [];

      const filteredCards = [
        ...handCards,
        ...deckCards,
        ...topDiscardUpCard,
        ...topDiscardDownCard
      ];

      const visibleCards = filteredCards.map((c: any) => {
        const isOwnCard = seat_index >= 0 && c.owner_seat === seat_index && c.location === 'hand';
        const reveal = isOwnCard || c.face_up;
        return { ...c, value: reveal ? c.value : null, suit: reveal ? c.suit : null };
      });

      // Action log
      const { data: logs } = await supabase
        .from('action_log')
        .select('*')
        .eq('game_id', game_id)
        .order('created_at', { ascending: false })
        .limit(10);

      return ok({
        game,
        players: enrichedPlayers,
        cards: visibleCards,
        my_seat: seat_index,
        action_log: logs?.reverse() ?? [],
      });
    }

    throw new Error(`Invalid type: ${type}`);
  } catch (e: any) {
    return err(e.message);
  }
});
