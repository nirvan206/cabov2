// spy: 8 or 9 ability — see one card from any opponent (who hasn't called Cabo)
// Drawn card goes face-UP (ability was used)
import { getUser, getServiceClient, getPlayerSeat, logAction, discardDrawnCard, advanceTurn, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { game_id, target_seat, card_index } = await req.json();
    const supabase = getServiceClient();

    const { seat_index } = await getPlayerSeat(supabase, game_id, user.id);
    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single();
    if (game.current_turn_seat !== seat_index) throw new Error('Not your turn');

    // Cabo protection: cannot spy on the cabo caller
    if (game.cabo_called && game.cabo_caller_seat === target_seat) {
      throw new Error("Cannot spy on CABO caller — their cards are locked");
    }

    const { data: card } = await supabase.from('cards')
      .select('*').eq('game_id', game_id).eq('owner_seat', target_seat).eq('hand_index', card_index).eq('location', 'hand').single();
    if (!card) throw new Error('Card not found');

    // Temporarily flip face-up so this player's get-state poll sees the real value
    await supabase.from('cards').update({ face_up: true }).eq('id', card.id);
    await logAction(supabase, game_id, seat_index, `Seat ${seat_index} spied on Seat ${target_seat}'s card ${card_index + 1}`);

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
