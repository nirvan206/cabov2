// keep-discard: player chose NOT to use special ability
// Drawn card goes face-DOWN to the "Unused" discard stack
import { getUser, getServiceClient, getPlayerSeat, logAction, discardDrawnCard, advanceTurn, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { game_id } = await req.json();
    const supabase = getServiceClient();

    const { seat_index } = await getPlayerSeat(supabase, game_id, user.id);
    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single();
    if (game.current_turn_seat !== seat_index) throw new Error('Not your turn');

    // Verify drawn card exists
    const { data: drawn } = await supabase.from('cards')
      .select('id').eq('game_id', game_id).eq('owner_seat', seat_index).eq('hand_index', 99).single();
    if (!drawn) throw new Error('No drawn card');

    // No ability used → face-DOWN secret discard stack
    await discardDrawnCard(supabase, game_id, seat_index, false);

    await logAction(supabase, game_id, seat_index, `Seat ${seat_index} discarded without using ability`);
    await advanceTurn(supabase, game_id);

    return ok({ message: 'Card discarded' });
  } catch (e: any) {
    return err(e.message);
  }
});
