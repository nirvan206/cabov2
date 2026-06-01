import { corsHeaders, ok, err } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const endpoints = ['game-management', 'game-actions', 'game-flow'];

    const promises = endpoints.map(async (ep) => {
      const url = `${supabaseUrl}/functions/v1/${ep}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ type: 'ping', game_id: '00000000-0000-0000-0000-000000000000' }),
        });
        return { endpoint: ep, status: res.status };
      } catch (e: any) {
        return { endpoint: ep, error: e.message };
      }
    });

    const results = await Promise.all(promises);
    return ok({ results });
  } catch (e: any) {
    return err(e.message);
  }
});
