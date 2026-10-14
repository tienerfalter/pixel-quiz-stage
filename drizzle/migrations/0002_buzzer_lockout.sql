CREATE OR REPLACE FUNCTION public.press_buzzer(_room text, _team uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _winner text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM room_teams WHERE id = _team AND room_code = upper(_room)) THEN RAISE EXCEPTION 'Team unbekannt'; END IF;
  UPDATE quiz_rooms SET buzzer_winner = _team::text
   WHERE room_code = upper(_room) AND buzzer_winner IS NULL AND phase = 'guessing'
     AND NOT (coalesce(state->'buzzerLocked', '[]'::jsonb) ? _team::text);
  SELECT buzzer_winner INTO _winner FROM quiz_rooms WHERE room_code = upper(_room);
  RETURN _winner;
END $$;