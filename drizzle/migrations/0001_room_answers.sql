CREATE TABLE public.room_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code text NOT NULL REFERENCES public.quiz_rooms(room_code) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.room_teams(id) ON DELETE CASCADE,
  question_index integer NOT NULL,
  answer jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, question_index)
);
GRANT SELECT ON public.room_answers TO anon, authenticated;
GRANT ALL ON public.room_answers TO service_role;
ALTER TABLE public.room_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "answers readable" ON public.room_answers FOR SELECT TO anon, authenticated USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_answers;

CREATE OR REPLACE FUNCTION public.submit_answer(_room text, _team uuid, _question integer, _answer jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM room_teams WHERE id = _team AND room_code = upper(_room)) THEN RAISE EXCEPTION 'Team unbekannt'; END IF;
  IF NOT EXISTS (SELECT 1 FROM quiz_rooms WHERE room_code = upper(_room) AND phase = 'guessing' AND current_question_index = _question) THEN RAISE EXCEPTION 'Eingaben gesperrt'; END IF;
  IF length(_answer::text) > 200 THEN RAISE EXCEPTION 'Antwort zu lang'; END IF;
  INSERT INTO room_answers(room_code, team_id, question_index, answer) VALUES (upper(_room), _team, _question, _answer)
  ON CONFLICT (team_id, question_index) DO NOTHING;
  RETURN true;
END $$;