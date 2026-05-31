import { getUser, getServiceClient, getPlayerSeat, logAction, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { game_id, target_seat, card_index } = await req.json();
    const supabase = getServiceClient();

    const { seat_index } = await getPlayerSeat(supabase, game_id, user.id);

    const { data: card } = await supabase.from('cards')
      .select('*').eq('game_id', game_id).eq('owner_seat', target_seat).eq('hand_index', card_index).eq('location', 'hand').single();
    if (!card) throw new Error('Card not found');

    // Temporarily mark as face_up — get-state RLS will show value only to caller
    await supabase.from('cards').update({ face_up: true }).eq('id', card.id);
    await logAction(supabase, game_id, seat_index, `Seat ${seat_index} spied on Seat ${target_seat}'s card`);

    setTimeout(async () => {
      await supabase.from('cards').update({ face_up: false }).eq('id', card.id);
    }, 3000);

    return ok({ card });
  } catch (e: any) {
    return err(e.message);
  }
});
