import { getUser, getServiceClient, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { game_id } = await req.json();
    const supabase = getServiceClient();

    await supabase.from('game_players').delete().eq('game_id', game_id).eq('player_id', user.id);

    const { count } = await supabase.from('game_players')
      .select('*', { count: 'exact', head: true }).eq('game_id', game_id);

    if ((count ?? 0) === 0) {
      await supabase.from('games').delete().eq('id', game_id);
    }

    return ok({ message: 'Left game' });
  } catch (e: any) {
    return err(e.message);
  }
});
