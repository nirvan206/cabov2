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

    // You can only call Cabo BEFORE drawing a card
    const { data: drawnCard } = await supabase.from('cards')
      .select('id').eq('game_id', game_id).eq('owner_seat', seat_index).eq('hand_index', 99).maybeSingle();
    if (drawnCard) throw new Error('Cannot call Cabo after drawing a card');

    await supabase.from('games').update({ cabo_called: true, cabo_caller_seat: seat_index }).eq('id', game_id);
    await logAction(supabase, game_id, seat_index, `📢 Seat ${seat_index} called CABO!`);
    await advanceTurn(supabase, game_id);

    return ok({ message: 'Cabo called' });
  } catch (e: any) {
    return err(e.message);
  }
});
