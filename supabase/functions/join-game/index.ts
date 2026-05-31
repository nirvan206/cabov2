import { getUser, getServiceClient, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { game_id } = await req.json();
    const supabase = getServiceClient();

    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single();
    if (!game) throw new Error('Game not found');
    if (game.status !== 'waiting') throw new Error('Game already started');

    const { data: existing } = await supabase.from('game_players')
      .select('seat_index').eq('game_id', game_id).eq('player_id', user.id).single();
    if (existing) return ok({ seat_index: existing.seat_index, message: 'Already in game' });

    const { data: seats } = await supabase.from('game_players')
      .select('seat_index').eq('game_id', game_id);
    const takenSeats = seats?.map((s: any) => s.seat_index) ?? [];
    if (takenSeats.length >= game.max_players) throw new Error('Game is full');

    let nextSeat = 0;
    while (takenSeats.includes(nextSeat)) nextSeat++;

    await supabase.from('game_players').insert({
      game_id, player_id: user.id, seat_index: nextSeat, is_ready: false,
    });

    return ok({ seat_index: nextSeat });
  } catch (e: any) {
    return err(e.message);
  }
});
