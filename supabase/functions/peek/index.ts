import { getUser, getServiceClient, getPlayerSeat, logAction, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { game_id, card_index } = await req.json();
    const supabase = getServiceClient();

    const { seat_index } = await getPlayerSeat(supabase, game_id, user.id);

    const { data: card } = await supabase.from('cards')
      .select('*').eq('game_id', game_id).eq('owner_seat', seat_index).eq('hand_index', card_index).eq('location', 'hand').single();
    if (!card) throw new Error('Card not found');

    // Flip face up for this player only (in DB, realtime will fire)
    await supabase.from('cards').update({ face_up: true }).eq('id', card.id);
    await logAction(supabase, game_id, seat_index, `Seat ${seat_index} peeked at card ${card_index}`);

    // Auto-hide after 3 seconds
    setTimeout(async () => {
      await supabase.from('cards').update({ face_up: false }).eq('id', card.id);
    }, 3000);

    return ok({ card });
  } catch (e: any) {
    return err(e.message);
  }
});
