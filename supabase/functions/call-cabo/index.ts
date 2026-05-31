import { getUser, getServiceClient, getPlayerSeat, logAction, advanceTurn, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { game_id } = await req.json();
    const supabase = getServiceClient();

    const { seat_index } = await getPlayerSeat(supabase, game_id, user.id);
    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single();
    if (game.current_turn_seat !== seat_index) throw new Error('Not your turn');
    if (game.cabo_called) throw new Error('Cabo already called');

    await supabase.from('games').update({ cabo_called: true, cabo_caller_seat: seat_index }).eq('id', game_id);
    await logAction(supabase, game_id, seat_index, `Seat ${seat_index} called CABO!`);
    await advanceTurn(supabase, game_id);

    return ok({ message: 'Cabo called' });
  } catch (e: any) {
    return err(e.message);
  }
});
