import { getUser, getServiceClient, findPlayerSeat, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { game_id } = await req.json();
    if (!game_id) throw new Error('game_id is required');
    const supabase = getServiceClient();

    // Get game — anyone can call get-state if they know the game_id
    const { data: game, error: gameErr } = await supabase
      .from('games').select('*').eq('id', game_id).single();
    if (gameErr || !game) throw new Error('Game not found');

    // Find caller's seat — returns -1 if not yet in game (waiting room polling case)
    const seat_index = await findPlayerSeat(supabase, game_id, user.id);

    // Players
    const { data: players } = await supabase
      .from('game_players')
      .select('id, seat_index, player_id, total_score, round_scores, is_ready')
      .eq('game_id', game_id)
      .order('seat_index');

    // Enrich with profile data
    const playerIds = players?.map((p: any) => p.player_id) ?? [];
    const { data: profiles } = playerIds.length > 0
      ? await supabase.from('profiles').select('id, username, avatar_url').in('id', playerIds)
      : { data: [] };

    const enrichedPlayers = players?.map((p: any) => ({
      ...p,
      username: profiles?.find((pr: any) => pr.id === p.player_id)?.username ?? 'Unknown',
      avatar_url: profiles?.find((pr: any) => pr.id === p.player_id)?.avatar_url ?? null,
    })) ?? [];

    // Cards: hide opponent hand values. If seat_index === -1 hide everything.
    const { data: allCards } = await supabase
      .from('cards').select('*').eq('game_id', game_id);

    const visibleCards = allCards?.map((c: any) => {
      const isOwnCard = seat_index >= 0 && c.owner_seat === seat_index && c.location === 'hand';
      const reveal = isOwnCard || c.face_up;
      return { ...c, value: reveal ? c.value : null, suit: reveal ? c.suit : null };
    }) ?? [];

    // Action log
    const { data: logs } = await supabase
      .from('action_log')
      .select('*')
      .eq('game_id', game_id)
      .order('created_at', { ascending: false })
      .limit(10);

    return ok({
      game,
      players: enrichedPlayers,
      cards: visibleCards,
      my_seat: seat_index,
      action_log: logs?.reverse() ?? [],
    });
  } catch (e: any) {
    return err(e.message);
  }
});
