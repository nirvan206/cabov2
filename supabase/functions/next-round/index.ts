import { getUser, getServiceClient, getPlayerSeat, logAction, corsHeaders, ok, err } from '../_shared/utils.ts';

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { game_id } = await req.json();
    const supabase = getServiceClient();

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

    const { data: deckCards } = await supabase.from('cards').select('id').eq('game_id', game_id).eq('location', 'deck').order('hand_index');
    let cardIdx = 0;
    for (let i = 0; i < 4; i++) {
      for (const player of players!) {
        const card = deckCards![cardIdx++];
        await supabase.from('cards').update({ location: 'hand', owner_seat: player.seat_index, hand_index: i, face_up: false }).eq('id', card.id);
      }
    }

    await supabase.from('games').update({
      current_round: newRound,
      current_turn_seat: winnerSeat,
      phase: 'peeking',
      status: 'playing',
      cabo_called: false,
      cabo_caller_seat: null,
    }).eq('id', game_id);

    setTimeout(async () => {
      await supabase.from('games').update({ phase: 'playing' }).eq('id', game_id);
    }, 7000);

    await logAction(supabase, game_id, winnerSeat, `Round ${newRound} started!`);
    return ok({ message: 'Next round started' });
  } catch (e: any) {
    return err(e.message);
  }
});
