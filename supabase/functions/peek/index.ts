// peek: 6 or 7 ability — see one of your own cards for 3 seconds
// Drawn card goes face-UP (ability was used, everyone knows)
import { getUser, getServiceClient, getPlayerSeat, logAction, discardDrawnCard, advanceTurn, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { game_id, card_index } = await req.json();
    const supabase = getServiceClient();

    const { seat_index } = await getPlayerSeat(supabase, game_id, user.id);
    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single();
    if (game.current_turn_seat !== seat_index) throw new Error('Not your turn');

    const { data: card } = await supabase.from('cards')
      .select('*').eq('game_id', game_id).eq('owner_seat', seat_index).eq('hand_index', card_index).eq('location', 'hand').single();
    if (!card) throw new Error('Card not found');

    // Flip face up so get-state returns the real value to this player
    await supabase.from('cards').update({ face_up: true }).eq('id', card.id);
    await logAction(supabase, game_id, seat_index, `Seat ${seat_index} peeked at their card ${card_index + 1}`);

    // Auto-hide after 3 seconds
    setTimeout(async () => {
      await supabase.from('cards').update({ face_up: false }).eq('id', card.id);
    }, 3000);

    // Discard drawn card face-UP (ability was used → "Used Special Cards" stack)
    await discardDrawnCard(supabase, game_id, seat_index, true);
    await advanceTurn(supabase, game_id);

    return ok({ card });
  } catch (e: any) {
    return err(e.message);
  }
});
