// blind-swap: 10 or J ability — swap one of your cards with an opponent's card blindly
// Drawn card goes face-UP (ability was used)
import { getUser, getServiceClient, getPlayerSeat, logAction, discardDrawnCard, advanceTurn, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { game_id, my_index, target_seat, target_index } = await req.json();
    const supabase = getServiceClient();

    const { seat_index } = await getPlayerSeat(supabase, game_id, user.id);
    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single();
    if (game.current_turn_seat !== seat_index) throw new Error('Not your turn');

    // Cabo protection: cannot swap with the cabo caller
    if (game.cabo_called && game.cabo_caller_seat === target_seat) {
      throw new Error("Cannot swap with CABO caller — their cards are locked");
    }

    // Get both cards
    const { data: myCard } = await supabase.from('cards')
      .select('*').eq('game_id', game_id).eq('owner_seat', seat_index).eq('hand_index', my_index).eq('location', 'hand').single();
    const { data: targetCard } = await supabase.from('cards')
      .select('*').eq('game_id', game_id).eq('owner_seat', target_seat).eq('hand_index', target_index).eq('location', 'hand').single();
    if (!myCard || !targetCard) throw new Error('Cards not found');

    // Swap owners
    await supabase.from('cards').update({ owner_seat: target_seat, hand_index: target_index }).eq('id', myCard.id);
    await supabase.from('cards').update({ owner_seat: seat_index, hand_index: my_index }).eq('id', targetCard.id);

    // Discard drawn card face-UP (ability was used)
    await discardDrawnCard(supabase, game_id, seat_index, true);

    await logAction(supabase, game_id, seat_index, `Seat ${seat_index} blind-swapped a card with Seat ${target_seat}`);
    await advanceTurn(supabase, game_id);

    return ok({ message: 'Blind swap done' });
  } catch (e: any) {
    return err(e.message);
  }
});
