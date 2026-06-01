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

  // If cabo was called and we've gone around back to the caller → end round
  if (game.cabo_called && nextSeat === game.cabo_caller_seat) {
    await endRound(supabase, gameId);
    return;
  }

  await supabase.from('games').update({ current_turn_seat: nextSeat }).eq('id', gameId);
};

// Discard the active drawn card (hand_index=99) with the correct face-up/down
// used_ability=true → discard_up (face-up, visible to all)
// used_ability=false → discard_down (face-down, secret)
export const discardDrawnCard = async (supabase: any, gameId: string, seatIndex: number, usedAbility: boolean) => {
  const { data: drawn } = await supabase.from('cards')
    .select('id').eq('game_id', gameId).eq('owner_seat', seatIndex).eq('hand_index', 99).maybeSingle();
  if (!drawn) return;
  const location = usedAbility ? 'discard_up' : 'discard_down';
  await supabase.from('cards').update({
    location,
    owner_seat: null,
    face_up: usedAbility,
  }).eq('id', drawn.id);
};

// Refresh deck from both discard piles when deck runs out
export const refreshDeckIfEmpty = async (supabase: any, gameId: string) => {
  const { data: deck } = await supabase.from('cards')
    .select('id').eq('game_id', gameId).eq('location', 'deck').limit(1);
  if (deck && deck.length > 0) return; // still has cards

  // Collect all discarded cards (both stacks), excluding player hands and drawn card
  const { data: discardCards } = await supabase.from('cards')
    .select('*')
    .eq('game_id', gameId)
    .in('location', ['discard_up', 'discard_down']);

  if (!discardCards || discardCards.length === 0) return; // nothing to recycle

  // Fisher-Yates shuffle of cards
  for (let i = discardCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [discardCards[i], discardCards[j]] = [discardCards[j], discardCards[i]];
  }

  const updates = discardCards.map((c: any, i: number) => ({
    ...c,
    location: 'deck',
    owner_seat: null,
    face_up: false,
    hand_index: i,
  }));

  await supabase.from('cards').upsert(updates);
};

export const endRound = async (supabase: any, gameId: string) => {
  const { data: game } = await supabase.from('games').select('*').eq('id', gameId).single();

  // Reveal all hand cards
  await supabase.from('cards').update({ face_up: true }).eq('game_id', gameId).eq('location', 'hand');

  // Calculate and store round scores in single SQL query via RPC
  await supabase.rpc('end_round_scores', { p_game_id: gameId });

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

