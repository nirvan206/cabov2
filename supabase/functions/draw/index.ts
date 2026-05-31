import { getUser, getServiceClient, getPlayerSeat, logAction, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { game_id } = await req.json();
    const supabase = getServiceClient();

    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single();
    if (!game || game.phase !== 'playing') throw new Error('Not your turn to draw');

    const { seat_index } = await getPlayerSeat(supabase, game_id, user.id);
    if (game.current_turn_seat !== seat_index) throw new Error('Not your turn');

    // Get top deck card (lowest hand_index that is in deck)
    const { data: deckCards } = await supabase.from('cards')
      .select('*').eq('game_id', game_id).eq('location', 'deck').order('hand_index').limit(1);
    if (!deckCards || deckCards.length === 0) throw new Error('Deck is empty');

    const card = deckCards[0];
    await supabase.from('cards').update({
      location: 'hand',
      owner_seat: seat_index,
      hand_index: 99, // drawn card marker
      face_up: true,
    }).eq('id', card.id);

    await logAction(supabase, game_id, seat_index, `Seat ${seat_index} drew a card`);

    return ok({ card: { ...card, location: 'hand', face_up: true } });
  } catch (e: any) {
    return err(e.message);
  }
});
