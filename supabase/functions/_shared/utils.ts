// Shared utilities for all Edge Functions
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const getServiceClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

export const getUser = async (req: Request) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Error('No authorization header');
  const token = authHeader.replace('Bearer ', '');
  const supabase = getServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Unauthorized');
  return user;
};

// Always produces a globally-unique username by appending 6 chars of UUID
export const upsertProfile = async (supabase: any, user: any) => {
  const raw = (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'player'
  ).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 14);

  const username = `${raw}_${user.id.slice(0, 6)}`;

  const { error } = await supabase.from('profiles').upsert(
    { id: user.id, username, avatar_url: user.user_metadata?.avatar_url ?? null },
    { onConflict: 'id' }
  );
  if (error) throw new Error(`Profile sync failed: ${error.message}`);
  return username;
};

// Returns seat_index or -1 if not in game (never throws)
export const findPlayerSeat = async (supabase: any, gameId: string, playerId: string): Promise<number> => {
  const { data } = await supabase
    .from('game_players')
    .select('seat_index')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .single();
  return data?.seat_index ?? -1;
};

// Throws if player is not in game
export const getPlayerSeat = async (supabase: any, gameId: string, playerId: string) => {
  const { data, error } = await supabase
    .from('game_players')
    .select('seat_index, id')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .single();
  if (error || !data) throw new Error('Player not in game');
  return data;
};

export const logAction = async (supabase: any, gameId: string, seatIndex: number, message: string) => {
  await supabase.from('action_log').insert({ game_id: gameId, seat_index: seatIndex, message });
};

export const advanceTurn = async (supabase: any, gameId: string) => {
  const { data: game } = await supabase.from('games').select('*').eq('id', gameId).single();
  const { data: players } = await supabase.from('game_players').select('seat_index').eq('game_id', gameId).order('seat_index');

  const seats: number[] = players.map((p: any) => p.seat_index);
  const currentSeat = game.current_turn_seat;
  const currentIdx = seats.indexOf(currentSeat);
  const nextIdx = (currentIdx + 1) % seats.length;
  const nextSeat = seats[nextIdx];

  if (game.cabo_called && nextSeat === game.cabo_caller_seat) {
    await endRound(supabase, gameId);
    return;
  }

  await supabase.from('games').update({ current_turn_seat: nextSeat }).eq('id', gameId);
};

export const endRound = async (supabase: any, gameId: string) => {
  const { data: game } = await supabase.from('games').select('*').eq('id', gameId).single();
  const { data: players } = await supabase.from('game_players').select('*').eq('game_id', gameId);
  const { data: cards } = await supabase.from('cards').select('*').eq('game_id', gameId).eq('location', 'hand');

  await supabase.from('cards').update({ face_up: true }).eq('game_id', gameId).eq('location', 'hand');

  for (const player of players) {
    const playerCards = cards.filter((c: any) => c.owner_seat === player.seat_index);
    const roundScore = playerCards.reduce((sum: number, c: any) => sum + c.value, 0);
    const newScores = [...(player.round_scores || []), roundScore];
    await supabase.from('game_players').update({
      round_scores: newScores,
      total_score: player.total_score + roundScore,
    }).eq('id', player.id);
  }

  const isGameEnd = game.current_round >= 10;
  await supabase.from('games').update({
    phase: isGameEnd ? 'game_end' : 'round_end',
    status: isGameEnd ? 'finished' : 'round_end',
  }).eq('id', gameId);
};

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const ok = (data: object) =>
  new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

export const err = (msg: string, status = 400) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
