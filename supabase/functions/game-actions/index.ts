import { getUser, getServiceClient, getPlayerSeat, logAction, refreshDeckIfEmpty, discardDrawnCard, advanceTurn, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const body = await req.json();
    const { type, game_id } = body;
    const supabase = getServiceClient();

    if (type === 'ping') {
      return ok({ message: 'pong' });
    }

    if (!game_id) throw new Error('game_id is required');

    if (type === 'draw') {
      const { seat_index } = await getPlayerSeat(supabase, game_id, user.id);
      const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single();
      if (!game || game.phase !== 'playing') throw new Error('Not your turn to draw');
      if (game.current_turn_seat !== seat_index) throw new Error('Not your turn');

      // Prevent duplicate draw
      const { data: existingDrawn } = await supabase.from('cards')
        .select('id').eq('game_id', game_id).eq('owner_seat', seat_index)
        .eq('hand_index', 99).maybeSingle();
      if (existingDrawn) throw new Error('Already drawn a card this turn');

      // Refresh deck from discards if empty
      await refreshDeckIfEmpty(supabase, game_id);

      // Get top deck card
      const { data: deckCards } = await supabase.from('cards')
        .select('*').eq('game_id', game_id).eq('location', 'deck').order('hand_index').limit(1);
      if (!deckCards || deckCards.length === 0) throw new Error('No cards left in deck or discard');

      const card = deckCards[0];
      await supabase.from('cards').update({
        location: 'hand',
        owner_seat: seat_index,
        hand_index: 99, // drawn card marker
        face_up: false,
      }).eq('id', card.id);

      await logAction(supabase, game_id, seat_index, `${seat_index} drew a card`);

      return ok({ card: { ...card, location: 'hand', face_up: true } });
    }

    if (type === 'keep-discard') {
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
    }

    if (type === 'swap-drawn') {
      const { hand_index } = body;
      if (hand_index === undefined) throw new Error('hand_index is required');

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
    }

    if (type === 'peek') {
      const { card_index } = body;
      if (card_index === undefined) throw new Error('card_index is required');

      const { seat_index } = await getPlayerSeat(supabase, game_id, user.id);
      const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single();
      if (game.current_turn_seat !== seat_index) throw new Error('Not your turn');

      const { data: card } = await supabase.from('cards')
        .select('*').eq('game_id', game_id).eq('owner_seat', seat_index).eq('hand_index', card_index).eq('location', 'hand').single();
      if (!card) throw new Error('Card not found');

      // No DB face_up mutation needed — get-state already provides our own card values.
      // We just discard the drawn card and advance turn.
      await logAction(supabase, game_id, seat_index, `Seat ${seat_index} peeked at their card ${card_index + 1}`);

      await discardDrawnCard(supabase, game_id, seat_index, true);
      await advanceTurn(supabase, game_id);

      return ok({ card });
    }

    if (type === 'spy') {
      const { target_seat, card_index } = body;
      if (target_seat === undefined || card_index === undefined) throw new Error('target_seat and card_index are required');

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

      await logAction(supabase, game_id, seat_index, `Seat ${seat_index} spied on Seat ${target_seat}'s card ${card_index + 1}`);

      // Discard drawn card face-UP (ability was used)
      await discardDrawnCard(supabase, game_id, seat_index, true);
      await advanceTurn(supabase, game_id);

      return ok({ card });
    }

    if (type === 'blind-swap') {
      const { my_index, target_seat, target_index } = body;
      if (my_index === undefined || target_seat === undefined || target_index === undefined) {
        throw new Error('my_index, target_seat, and target_index are required');
      }

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
    }

    if (type === 'swap-with-peek') {
      const { my_index, target_seat, target_index, phase = 'swap' } = body;
      if (my_index === undefined || target_seat === undefined || target_index === undefined) {
        throw new Error('my_index, target_seat, and target_index are required');
      }

      const { seat_index } = await getPlayerSeat(supabase, game_id, user.id);
      const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single();
      if (game.current_turn_seat !== seat_index) throw new Error('Not your turn');

      // Cabo protection
      if (game.cabo_called && game.cabo_caller_seat === target_seat) {
        throw new Error("Cannot swap with CABO caller — their cards are locked");
      }

      const { data: myCard } = await supabase.from('cards')
        .select('*').eq('game_id', game_id).eq('owner_seat', seat_index).eq('hand_index', my_index).eq('location', 'hand').single();
      const { data: targetCard } = await supabase.from('cards')
        .select('*').eq('game_id', game_id).eq('owner_seat', target_seat).eq('hand_index', target_index).eq('location', 'hand').single();
      if (!myCard || !targetCard) throw new Error('Cards not found');

      if (phase === 'reveal') {
        // Just return the values so the client can animate them before swapping
        return ok({ myCard, targetCard });
      }

      // Phase === 'swap'
      await supabase.from('cards').update({ owner_seat: target_seat, hand_index: target_index }).eq('id', myCard.id);
      await supabase.from('cards').update({ owner_seat: seat_index, hand_index: my_index }).eq('id', targetCard.id);

      // Discard drawn card face-UP (ability was used)
      await discardDrawnCard(supabase, game_id, seat_index, true);
      await logAction(supabase, game_id, seat_index, `Seat ${seat_index} used seen-swap with Seat ${target_seat}`);
      await advanceTurn(supabase, game_id);

      return ok({ message: 'Swap completed' });
    }

    if (type === 'call-cabo') {
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
    }

    if (type === 'end-peeking') {
      // Only update if it's currently peeking to avoid race conditions
      await supabase.from('games').update({ phase: 'playing' }).eq('id', game_id).eq('phase', 'peeking');
      return ok({ message: 'Peeking ended' });
    }

    throw new Error(`Invalid type: ${type}`);
  } catch (e: any) {
    return err(e.message);
  }
});
