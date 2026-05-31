import { getUser, getServiceClient, getPlayerSeat, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { game_id } = await req.json();
    const supabase = getServiceClient();

    const { seat_index } = await getPlayerSeat(supabase, game_id, user.id);
    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single();
    const { data: players } = await supabase.from('game_players')
      .select('id, seat_index, player_id, total_score, round_scores, is_ready')
      .eq('game_id', game_id).order('seat_index');

    // Join with profiles for usernames
    const playerIds = players?.map((p: any) => p.player_id) ?? [];
    const { data: profiles } = await supabase.from('profiles')
      .select('id, username, avatar_url').in('id', playerIds);

    const enrichedPlayers = players?.map((p: any) => ({
      ...p,
      username: profiles?.find((pr: any) => pr.id === p.player_id)?.username ?? 'Unknown',
      avatar_url: profiles?.find((pr: any) => pr.id === p.player_id)?.avatar_url ?? null,
    }));

    // Cards: only return full value for caller's own hand cards or face_up cards
    const { data: allCards } = await supabase.from('cards').select('*').eq('game_id', game_id);
    const visibleCards = allCards?.map((c: any) => ({
      ...c,
      value: (c.owner_seat === seat_index && c.location === 'hand') || c.face_up ? c.value : null,
      suit: (c.owner_seat === seat_index && c.location === 'hand') || c.face_up ? c.suit : null,
    }));

    const { data: logs } = await supabase.from('action_log')
      .select('*').eq('game_id', game_id).order('created_at', { ascending: false }).limit(10);

    return ok({ game, players: enrichedPlayers, cards: visibleCards, action_log: logs?.reverse() ?? [] });
  } catch (e: any) {
    return err(e.message);
  }
});
