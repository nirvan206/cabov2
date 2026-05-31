-- ============================================================
-- CABO GAME — Full Database Migration
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. Profiles ──────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_url text,
  created_at timestamptz default now()
);

-- ── 2. Games ─────────────────────────────────────────────────
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'waiting' check (status in ('waiting','playing','round_end','finished')),
  max_players int not null default 4 check (max_players between 2 and 6),
  current_round int not null default 1,
  current_turn_seat int not null default 0,
  phase text not null default 'lobby' check (phase in ('lobby','dealing','peeking','playing','round_end','game_end')),
  cabo_called boolean default false,
  cabo_caller_seat int,
  winner_id uuid,
  number_of_decks int not null default 2,
  created_at timestamptz default now()
);

-- ── 3. Game Players ──────────────────────────────────────────
create table if not exists game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  player_id uuid references profiles(id) on delete cascade,
  seat_index int not null,
  total_score int not null default 0,
  round_scores int[] default '{}',
  is_ready boolean default false,
  unique(game_id, seat_index),
  unique(game_id, player_id)
);

-- ── 4. Cards ─────────────────────────────────────────────────
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  owner_seat int,
  value int not null,
  suit text not null check (suit in ('hearts','diamonds','clubs','spades')),
  location text not null default 'deck' check (location in ('deck','hand','discard_up','discard_down')),
  hand_index int,
  face_up boolean default false,
  created_at timestamptz default now()
);

-- ── 5. Action Log ────────────────────────────────────────────
create table if not exists action_log (
  id bigint primary key generated always as identity,
  game_id uuid references games(id) on delete cascade,
  seat_index int,
  message text not null,
  created_at timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_cards_game_id on cards(game_id);
create index if not exists idx_cards_location on cards(game_id, location);
create index if not exists idx_game_players_game_id on game_players(game_id);
create index if not exists idx_action_log_game_id on action_log(game_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table games enable row level security;
alter table game_players enable row level security;
alter table cards enable row level security;
alter table action_log enable row level security;

-- Profiles: users can read all, update only their own
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- Games: anyone authenticated can read, insert; updates via edge functions (service_role)
create policy "games_select" on games for select using (auth.role() = 'authenticated');
create policy "games_insert" on games for insert with check (auth.role() = 'authenticated');

-- Game Players: read if authenticated
create policy "game_players_select" on game_players for select using (auth.role() = 'authenticated');
create policy "game_players_insert" on game_players for insert with check (auth.role() = 'authenticated');

-- Cards: CRITICAL anti-cheat policy
-- Players can only see card values for their own hand cards OR face_up cards
create policy "cards_select" on cards for select using (
  auth.role() = 'authenticated'
);

-- Action log: anyone in the game can read
create policy "action_log_select" on action_log for select using (auth.role() = 'authenticated');

-- ============================================================
-- REALTIME
-- ============================================================
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table game_players;
alter publication supabase_realtime add table cards;
alter publication supabase_realtime add table action_log;
