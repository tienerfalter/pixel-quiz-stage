DROP POLICY IF EXISTS "rooms readable" ON public.quiz_rooms;
DROP POLICY IF EXISTS "teams readable" ON public.room_teams;
DROP POLICY IF EXISTS "answers readable" ON public.room_answers;
REVOKE SELECT ON public.quiz_rooms, public.room_teams, public.room_answers FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_room(_room text)
RETURNS TABLE(room_code text, phase text, current_question_index int, buzzer_winner text, state jsonb, quiz jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.room_code, r.phase, r.current_question_index, r.buzzer_winner, r.state, r.quiz
  FROM public.quiz_rooms r WHERE r.room_code = upper(_room);
$$;

CREATE OR REPLACE FUNCTION public.get_room_teams(_room text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name FROM public.room_teams t WHERE t.room_code = upper(_room) ORDER BY t.created_at;
$$;

CREATE OR REPLACE FUNCTION public.get_room_answers(_room text, _question int)
RETURNS TABLE(team_id uuid, answer jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.team_id, a.answer, a.created_at FROM public.room_answers a
  WHERE a.room_code = upper(_room) AND a.question_index = _question;
$$;

GRANT EXECUTE ON FUNCTION public.get_room(text), public.get_room_teams(text), public.get_room_answers(text, int) TO anon, authenticated;

-- Broadcast a lightweight "changed" signal per room so clients refetch via the functions above
CREATE OR REPLACE FUNCTION public.notify_room_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _code text := COALESCE(NEW.room_code, OLD.room_code);
BEGIN
  PERFORM realtime.send(jsonb_build_object('table', TG_TABLE_NAME), 'change', 'room:' || _code, false);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS quiz_rooms_notify ON public.quiz_rooms;
CREATE TRIGGER quiz_rooms_notify AFTER INSERT OR UPDATE OR DELETE ON public.quiz_rooms FOR EACH ROW EXECUTE FUNCTION public.notify_room_change();
DROP TRIGGER IF EXISTS room_teams_notify ON public.room_teams;
CREATE TRIGGER room_teams_notify AFTER INSERT OR UPDATE OR DELETE ON public.room_teams FOR EACH ROW EXECUTE FUNCTION public.notify_room_change();
DROP TRIGGER IF EXISTS room_answers_notify ON public.room_answers;
CREATE TRIGGER room_answers_notify AFTER INSERT OR UPDATE OR DELETE ON public.room_answers FOR EACH ROW EXECUTE FUNCTION public.notify_room_change();