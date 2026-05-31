import { getUser, getServiceClient, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    const { game_id } = await req.json();
    const supabase = getServiceClient();

    // Mark player as ready
    await supabase.from('game_players')
      .update({ is_ready: true })
      .eq('game_id', game_id)
      .eq('player_id', user.id);

    return ok({ message: 'Ready' });
  } catch (e: any) {
    return err(e.message);
  }
});
