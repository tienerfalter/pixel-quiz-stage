CREATE TABLE public.quiz_rooms (
  room_code text PRIMARY KEY,
  current_question_index integer NOT NULL DEFAULT 0,
  phase text NOT NULL DEFAULT 'intro',
  timer_seconds_left integer NOT NULL DEFAULT 0,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  buzzer_winner text,
  state jsonb,
  quiz jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.quiz_rooms TO anon, authenticated;
GRANT ALL ON public.quiz_rooms TO service_role;
ALTER TABLE public.quiz_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms readable" ON public.quiz_rooms FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.room_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code text NOT NULL REFERENCES public.quiz_rooms(room_code) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.room_teams TO anon, authenticated;
GRANT ALL ON public.room_teams TO service_role;
ALTER TABLE public.room_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams readable" ON public.room_teams FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.join_room(_room text, _name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF length(trim(_name)) < 1 OR length(_name) > 40 THEN RAISE EXCEPTION 'Ungültiger Teamname'; END IF;
  IF NOT EXISTS (SELECT 1 FROM quiz_rooms WHERE room_code = upper(_room)) THEN RAISE EXCEPTION 'Raum nicht gefunden'; END IF;
  IF (SELECT count(*) FROM room_teams WHERE room_code = upper(_room)) >= 30 THEN RAISE EXCEPTION 'Raum ist voll'; END IF;
  INSERT INTO room_teams(room_code, name) VALUES (upper(_room), trim(_name)) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.press_buzzer(_room text, _team uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _winner text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM room_teams WHERE id = _team AND room_code = upper(_room)) THEN RAISE EXCEPTION 'Team unbekannt'; END IF;
  UPDATE quiz_rooms SET buzzer_winner = _team::text
   WHERE room_code = upper(_room) AND buzzer_winner IS NULL AND phase = 'guessing';
  SELECT buzzer_winner INTO _winner FROM quiz_rooms WHERE room_code = upper(_room);
  RETURN _winner;
END $$;
GRANT EXECUTE ON FUNCTION public.join_room(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.press_buzzer(text, uuid) TO anon, authenticated;

ALTER TABLE public.quiz_rooms REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_teams;