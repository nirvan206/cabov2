-- ── 1. Create Performance Indexes ───────────────────────────
CREATE INDEX IF NOT EXISTS idx_cards_game_location_owner
  ON cards(game_id, location, owner_seat);

CREATE INDEX IF NOT EXISTS idx_game_players_seat
  ON game_players(game_id, seat_index);

CREATE INDEX IF NOT EXISTS idx_cards_drawn
  ON cards(game_id, owner_seat, hand_index)
  WHERE hand_index = 99;

-- ── 2. Enable pg_net Extension ──────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 3. Stored Procedure for End Round Scores ────────────────
CREATE OR REPLACE FUNCTION end_round_scores(p_game_id uuid) RETURNS void AS $$
BEGIN
  WITH player_scores AS (
    SELECT
      gp.id AS player_row_id,
      gp.total_score AS prev_total,
      COALESCE(SUM(c.value), 0) AS round_score
    FROM game_players gp
    LEFT JOIN cards c ON c.game_id = gp.game_id
      AND c.owner_seat = gp.seat_index
      AND c.location = 'hand'
    WHERE gp.game_id = p_game_id
    GROUP BY gp.id, gp.total_score
  )
  UPDATE game_players gp SET
    total_score = ps.prev_total + ps.round_score,
    round_scores = array_append(gp.round_scores, ps.round_score::int)
  FROM player_scores ps
  WHERE gp.id = ps.player_row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Stored Procedures for scheduling timers via pg_net ──
CREATE OR REPLACE FUNCTION schedule_peek_timer(game_id uuid) RETURNS void AS $$
BEGIN
  PERFORM net.schedule(
    'peek-timer-' || game_id,
    '7 seconds',
    'UPDATE games SET phase=''playing'' WHERE id=''' || game_id || ''' AND phase=''peeking'''
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE games SET phase='playing' WHERE id=game_id AND phase='peeking';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
