import { getUser, getServiceClient, upsertProfile, corsHeaders, ok, err, advanceTurn, logAction } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const { type, game_id } = body;
    const supabase = getServiceClient();

    if (type === 'ping') {
      return ok({ message: 'pong' });
    }

    let user;
    if (type !== 'terminate-game') {
      user = await getUser(req);
    }

    if (type === 'create-game') {
      const { max_players = 4, num_decks = 2 } = body;
      // Auto-clean waiting rooms older than 5 minutes
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: stale } = await supabase
        .from('games').select('id').eq('status', 'waiting').lt('created_at', cutoff);
      if (stale?.length) {
        await supabase.from('games').delete().in('id', stale.map((g: any) => g.id));
      }

      // Ensure profile exists with unique username
      await upsertProfile(supabase, user);

      // Create game
      const { data: game, error: gameErr } = await supabase
        .from('games')
        .insert({ max_players, number_of_decks: num_decks, status: 'waiting', phase: 'lobby' })
        .select()
        .single();
      if (gameErr) throw new Error(gameErr.message);

      // Add creator as seat 0
      const { error: playerErr } = await supabase.from('game_players').insert({
        game_id: game.id,
        player_id: user.id,
        seat_index: 0,
        is_ready: false,
      });
      if (playerErr) throw new Error(playerErr.message);

      return ok({ game_id: game.id, seat_index: 0 });
    }

    if (type === 'join-game') {
      if (!game_id) throw new Error('game_id is required');

      // Get game
      const { data: game, error: gameErr } = await supabase
        .from('games').select('*').eq('id', game_id).single();
      if (gameErr || !game) throw new Error('Game not found');
      if (game.status !== 'waiting') throw new Error('Game has already started');

      // Already in game? Return existing seat
      const { data: existing } = await supabase.from('game_players')
        .select('seat_index').eq('game_id', game_id).eq('player_id', user.id).single();
      if (existing) return ok({ seat_index: existing.seat_index, already_joined: true });

      // Check capacity
      const { data: seats } = await supabase.from('game_players')
        .select('seat_index').eq('game_id', game_id);
      const takenSeats = seats?.map((s: any) => s.seat_index) ?? [];
      if (takenSeats.length >= game.max_players) throw new Error('Game is full');

      // Find next available seat
      let nextSeat = 0;
      while (takenSeats.includes(nextSeat)) nextSeat++;

      // Ensure profile exists with unique username (must happen before game_players insert)
      await upsertProfile(supabase, user);

      // Join game
      const { error: insertErr } = await supabase.from('game_players').insert({
        game_id,
        player_id: user.id,
        seat_index: nextSeat,
        is_ready: false,
      });
      if (insertErr) throw new Error(insertErr.message);

      return ok({ seat_index: nextSeat });
    }

    if (type === 'leave-game') {
      if (!game_id) throw new Error('game_id is required');

      // Fetch the player and game state before deletion
      const { data: player } = await supabase.from('game_players')
        .select('*').eq('game_id', game_id).eq('player_id', user.id).maybeSingle();
      
      if (!player) return ok({ message: 'Already left' });

      const { data: game } = await supabase.from('games')
        .select('*').eq('id', game_id).single();

      if (game && (game.status === 'playing' || game.phase !== 'lobby') && player.seat_index !== 0) {
        // If it is the leaving player's turn, advance it BEFORE removing them from game_players
        if (game.current_turn_seat === player.seat_index) {
          await advanceTurn(supabase, game_id);
        }

        // Move their cards to discard pile (face up)
        await supabase.from('cards')
          .update({ location: 'discard_up', face_up: true, owner_seat: null })
          .eq('game_id', game_id).eq('owner_seat', player.seat_index);

        // If they called CABO, reset it
        if (game.cabo_caller_seat === player.seat_index) {
          await supabase.from('games').update({ cabo_called: false, cabo_caller_seat: null }).eq('id', game_id);
        }

        await logAction(supabase, game_id, 0, `${player.username} left the game. Their cards were discarded.`);
      }

      await supabase.from('game_players').delete().eq('game_id', game_id).eq('player_id', user.id);

      const { count } = await supabase.from('game_players')
        .select('*', { count: 'exact', head: true }).eq('game_id', game_id);

      if ((count ?? 0) === 0) {
        await supabase.from('games').delete().eq('id', game_id);
      }

      return ok({ message: 'Left game' });
    }

    if (type === 'terminate-game') {
      if (!game_id) throw new Error('game_id is required');

      await supabase.from('games').update({ status: 'finished', phase: 'terminated' }).eq('id', game_id);
      return ok({ message: 'Game terminated' });
    }

    if (type === 'set-ready') {
      if (!game_id) throw new Error('game_id is required');

      // Mark player as ready
      await supabase.from('game_players')
        .update({ is_ready: true })
        .eq('game_id', game_id)
        .eq('player_id', user.id);

      return ok({ message: 'Ready' });
    }

    throw new Error(`Invalid type: ${type}`);
  } catch (e: any) {
    return err(e.message);
  }
});
