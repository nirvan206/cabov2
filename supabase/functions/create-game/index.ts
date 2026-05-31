import { getUser, getServiceClient, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { max_players = 4, num_decks = 2 } = await req.json();
    const supabase = getServiceClient();

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
  } catch (e: any) {
    return err(e.message);
  }
});
