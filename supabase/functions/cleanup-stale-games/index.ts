import { getServiceClient, corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = getServiceClient();

    // Delete any game in 'waiting' status older than 5 minutes
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: stale } = await supabase
      .from('games')
      .select('id')
      .eq('status', 'waiting')
      .lt('created_at', cutoff);

    if (stale && stale.length > 0) {
      const ids = stale.map((g: any) => g.id);
      await supabase.from('games').delete().in('id', ids);
    }

    return ok({ cleaned: stale?.length ?? 0 });
  } catch (e: any) {
    return err(e.message);
  }
});
