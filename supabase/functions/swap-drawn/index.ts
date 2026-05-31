import { getUser, getServiceClient, getPlayerSeat, logAction, advanceTurn, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { game_id, hand_index } = await req.json();
    const supabase = getServiceClient();

    const { seat_index } = await getPlayerSeat(supabase, game_id, user.id);
    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single();
    if (game.current_turn_seat !== seat_index) throw new Error('Not your turn');

    // Find drawn card
    const { data: drawn } = await supabase.from('cards')
      .select('*').eq('game_id', game_id).eq('owner_seat', seat_index).eq('hand_index', 99).single();
    if (!drawn) throw new Error('No drawn card');

    // Find the hand card to swap out
    const { data: handCard } = await supabase.from('cards')
      .select('*').eq('game_id', game_id).eq('owner_seat', seat_index).eq('hand_index', hand_index).eq('location', 'hand').single();
    if (!handCard) throw new Error('Hand card not found');

    // Swap: drawn card goes to hand, hand card goes to discard
    await supabase.from('cards').update({ location: 'hand', hand_index, face_up: false }).eq('id', drawn.id);
    await supabase.from('cards').update({ location: 'discard_down', owner_seat: null, face_up: false }).eq('id', handCard.id);

    await logAction(supabase, game_id, seat_index, `Seat ${seat_index} swapped drawn card with hand card ${hand_index}`);
    await advanceTurn(supabase, game_id);

    return ok({ message: 'Swapped' });
  } catch (e: any) {
    return err(e.message);
  }
});
