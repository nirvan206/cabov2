import { getUser, getServiceClient, upsertProfile, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { game_id } = await req.json();
    if (!game_id) throw new Error('game_id is required');
    const supabase = getServiceClient();

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
  } catch (e: any) {
    return err(e.message);
  }
});
