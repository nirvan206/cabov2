import { getUser, getServiceClient, getPlayerSeat, corsHeaders, ok, err } from '../_shared/utils.ts';

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
    const user = await getUser(req);
    const { game_id } = await req.json();
    const supabase = getServiceClient();

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
      .select('id').eq('game_id', game_id).eq('location', 'deck').order('hand_index');

    let cardIdx = 0;
    for (let i = 0; i < 4; i++) {
      for (const player of players) {
        const card = deckCards![cardIdx++];
        await supabase.from('cards').update({
          location: 'hand',
          owner_seat: player.seat_index,
          hand_index: i,
          face_up: false,
        }).eq('id', card.id);
      }
    }

    // Update game status
    await supabase.from('games').update({
      status: 'playing',
      phase: 'peeking',
      current_turn_seat: players[0].seat_index,
    }).eq('id', game_id);

    // Auto-advance to playing after 7 seconds
    setTimeout(async () => {
      await supabase.from('games').update({ phase: 'playing' }).eq('id', game_id);
    }, 7000);

    return ok({ message: 'Game started' });
  } catch (e: any) {
    return err(e.message);
  }
});
