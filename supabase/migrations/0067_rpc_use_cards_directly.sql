-- 0067: RPC 함수들 cards/card_* 직접 참조로 재정의
--
-- 배경: 0065 에서 qa_likes/qa_saves 등을 compat VIEW 로 만들었음.
--       PostgreSQL view 는 ON CONFLICT 같은 제약 기반 동작을 지원하지 않음.
--       toggle_qa_like / toggle_qa_save 가 INSERT ... ON CONFLICT 사용 → 실패.
--       (DELETE/SELECT 는 view 경유 OK 였지만 ON CONFLICT 가 막힘)
--
-- 해결: 이 5개 RPC 본문만 base table (card_likes/card_saves/cards) 직접 사용으로 갱신.
--       함수 이름은 RPC API 호환 위해 그대로 유지 (toggle_qa_like, increment_qa_view 등).

CREATE OR REPLACE FUNCTION public.toggle_qa_like(
  p_qa_id integer,
  p_identity_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(liked boolean, like_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auth uuid;
  v_profile_id uuid;
  v_count int;
  v_liked boolean;
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF p_identity_id IS NULL THEN
    v_profile_id := v_auth;
  ELSE
    SELECT p.id INTO v_profile_id
      FROM public.profiles p
     WHERE p.id = p_identity_id AND p.auth_user_id = v_auth
     LIMIT 1;
    IF v_profile_id IS NULL THEN v_profile_id := v_auth; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.card_likes WHERE card_id = p_qa_id AND user_id = v_profile_id) THEN
    DELETE FROM public.card_likes WHERE card_id = p_qa_id AND user_id = v_profile_id;
    v_liked := false;
  ELSE
    INSERT INTO public.card_likes (card_id, user_id)
      VALUES (p_qa_id, v_profile_id)
      ON CONFLICT DO NOTHING;
    v_liked := true;
  END IF;

  SELECT c.like_count INTO v_count FROM public.cards c WHERE c.id = p_qa_id;
  RETURN QUERY SELECT v_liked, COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_qa_save(
  p_qa_id bigint,
  p_identity_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(saved boolean, save_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auth uuid;
  v_profile_id uuid;
  v_count int;
  v_saved boolean;
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF p_identity_id IS NULL THEN
    v_profile_id := v_auth;
  ELSE
    SELECT p.id INTO v_profile_id
      FROM public.profiles p
     WHERE p.id = p_identity_id AND p.auth_user_id = v_auth
     LIMIT 1;
    IF v_profile_id IS NULL THEN v_profile_id := v_auth; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.card_saves WHERE card_id = p_qa_id AND user_id = v_profile_id) THEN
    DELETE FROM public.card_saves WHERE card_id = p_qa_id AND user_id = v_profile_id;
    v_saved := false;
  ELSE
    INSERT INTO public.card_saves (card_id, user_id)
      VALUES (p_qa_id, v_profile_id)
      ON CONFLICT DO NOTHING;
    v_saved := true;
  END IF;

  SELECT c.save_count INTO v_count FROM public.cards c WHERE c.id = p_qa_id;
  RETURN QUERY SELECT v_saved, COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_qa_share(p_qa_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE new_count integer;
BEGIN
  UPDATE public.cards SET share_count = COALESCE(share_count, 0) + 1
   WHERE id = p_qa_id RETURNING share_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_qa_pick(p_qa_id integer, p_pick boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.cards SET is_pick = p_pick WHERE id = p_qa_id;
  RETURN p_pick;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_qa_view(p_qa_id bigint)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.cards
     SET view_count = view_count + 1
   WHERE id = p_qa_id AND published = true
  RETURNING view_count;
$$;

SELECT 'OK 0067' AS status;
