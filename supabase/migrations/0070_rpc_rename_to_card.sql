-- 0070: RPC 함수명 + 파라미터명 일괄 rename (qa → card)
--
-- 컨벤션:
--   단수 카드 1건 대상 → toggle_card_like, increment_card_share 등
--   여러 카드 대상     → get_top_cards_by_views, feed_cards_scored 등
--   파라미터          → p_qa_id → p_card_id
--   트리거 함수       → on_card_view_insert 등

BEGIN;

-- ── 단수 카드 대상 (1건 조작) ──
DROP FUNCTION IF EXISTS public.toggle_qa_like(integer, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.toggle_card_like(
  p_card_id integer,
  p_identity_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(liked boolean, like_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_auth uuid; v_profile_id uuid; v_count int; v_liked boolean;
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_identity_id IS NULL THEN v_profile_id := v_auth;
  ELSE
    SELECT p.id INTO v_profile_id FROM public.profiles p
     WHERE p.id = p_identity_id AND p.auth_user_id = v_auth LIMIT 1;
    IF v_profile_id IS NULL THEN v_profile_id := v_auth; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.card_likes WHERE card_id = p_card_id AND user_id = v_profile_id) THEN
    DELETE FROM public.card_likes WHERE card_id = p_card_id AND user_id = v_profile_id;
    v_liked := false;
  ELSE
    INSERT INTO public.card_likes (card_id, user_id) VALUES (p_card_id, v_profile_id)
      ON CONFLICT DO NOTHING;
    v_liked := true;
  END IF;
  SELECT c.like_count INTO v_count FROM public.cards c WHERE c.id = p_card_id;
  RETURN QUERY SELECT v_liked, COALESCE(v_count, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.toggle_card_like(integer, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.toggle_qa_save(bigint, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.toggle_card_save(
  p_card_id bigint,
  p_identity_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(saved boolean, save_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_auth uuid; v_profile_id uuid; v_count int; v_saved boolean;
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_identity_id IS NULL THEN v_profile_id := v_auth;
  ELSE
    SELECT p.id INTO v_profile_id FROM public.profiles p
     WHERE p.id = p_identity_id AND p.auth_user_id = v_auth LIMIT 1;
    IF v_profile_id IS NULL THEN v_profile_id := v_auth; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.card_saves WHERE card_id = p_card_id AND user_id = v_profile_id) THEN
    DELETE FROM public.card_saves WHERE card_id = p_card_id AND user_id = v_profile_id;
    v_saved := false;
  ELSE
    INSERT INTO public.card_saves (card_id, user_id) VALUES (p_card_id, v_profile_id)
      ON CONFLICT DO NOTHING;
    v_saved := true;
  END IF;
  SELECT c.save_count INTO v_count FROM public.cards c WHERE c.id = p_card_id;
  RETURN QUERY SELECT v_saved, COALESCE(v_count, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.toggle_card_save(bigint, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.toggle_qa_pick(integer, boolean) CASCADE;
CREATE OR REPLACE FUNCTION public.toggle_card_pick(p_card_id integer, p_pick boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.cards SET is_pick = p_pick WHERE id = p_card_id;
  RETURN p_pick;
END;
$$;
GRANT EXECUTE ON FUNCTION public.toggle_card_pick(integer, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.increment_qa_share(integer) CASCADE;
CREATE OR REPLACE FUNCTION public.increment_card_share(p_card_id integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE new_count integer;
BEGIN
  UPDATE public.cards SET share_count = COALESCE(share_count, 0) + 1
   WHERE id = p_card_id RETURNING share_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_card_share(integer) TO authenticated;

DROP FUNCTION IF EXISTS public.increment_qa_view(bigint) CASCADE;
CREATE OR REPLACE FUNCTION public.increment_card_view(p_card_id bigint)
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  UPDATE public.cards SET view_count = view_count + 1
   WHERE id = p_card_id AND published = true
  RETURNING view_count;
$$;
GRANT EXECUTE ON FUNCTION public.increment_card_view(bigint) TO authenticated;

DROP FUNCTION IF EXISTS public.get_hot_qa_ids(integer) CASCADE;
CREATE OR REPLACE FUNCTION public.get_hot_card_ids(p_limit integer DEFAULT 50)
RETURNS TABLE(id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.id::bigint
    FROM public.cards c
   WHERE c.published = true
   ORDER BY (COALESCE(c.like_count, 0) + COALESCE(c.view_count, 0) / 5) DESC,
            c.created_at DESC
   LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_hot_card_ids(integer) TO authenticated, anon;

-- ── 여러 카드 대상 (TOP/검색/태그) ──
DROP FUNCTION IF EXISTS public.get_top_qas_by_views(integer, integer, integer) CASCADE;
CREATE OR REPLACE FUNCTION public.get_top_cards_by_views(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(card_id bigint, question text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT v.card_id, COUNT(*)::bigint AS c
      FROM public.card_views v, bounds b
     WHERE v.created_at >= b.since GROUP BY v.card_id
  )
  SELECT c.id AS card_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_views(integer, integer, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.get_top_qas_by_comments(integer, integer, integer) CASCADE;
CREATE OR REPLACE FUNCTION public.get_top_cards_by_comments(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(card_id bigint, question text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT cm.card_id, COUNT(*)::bigint AS c
      FROM public.comments cm, bounds b
     WHERE cm.created_at >= b.since AND cm.status = 'visible' GROUP BY cm.card_id
  )
  SELECT c.id AS card_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_comments(integer, integer, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.get_top_qas_by_likes(integer, integer, integer) CASCADE;
CREATE OR REPLACE FUNCTION public.get_top_cards_by_likes(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(card_id bigint, question text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT l.card_id, COUNT(*)::bigint AS c
      FROM public.card_likes l, bounds b
     WHERE l.created_at >= b.since GROUP BY l.card_id
  )
  SELECT c.id AS card_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_likes(integer, integer, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.get_top_qas_by_saves(integer, integer, integer) CASCADE;
CREATE OR REPLACE FUNCTION public.get_top_cards_by_saves(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(card_id bigint, question text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT s.card_id, COUNT(*)::bigint AS c
      FROM public.card_saves s, bounds b
     WHERE s.created_at >= b.since GROUP BY s.card_id
  )
  SELECT c.id AS card_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_saves(integer, integer, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.get_top_qas_by_shares(integer, integer, integer) CASCADE;
CREATE OR REPLACE FUNCTION public.get_top_cards_by_shares(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(card_id bigint, question text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT sh.card_id, COUNT(*)::bigint AS c
      FROM public.card_shares sh, bounds b
     WHERE sh.created_at >= b.since GROUP BY sh.card_id
  )
  SELECT c.id AS card_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_shares(integer, integer, integer) TO authenticated;

-- feed_qas_scored / search_qas_scored / tag_qas_scored — 본문이 복잡한 score 계산.
-- 함수명 유지 (코드 호출도 그대로) — 본문 마이그레이션은 별도 phase.

COMMIT;

SELECT 'OK 0070' AS status;

-- get_recent_likers — 1 card 대상 → get_recent_card_likers + p_card_id (이미 적용됨, 추가)
DROP FUNCTION IF EXISTS public.get_recent_card_likers(bigint, integer);
CREATE OR REPLACE FUNCTION public.get_recent_card_likers(
  p_card_id bigint, p_limit integer DEFAULT 5
)
RETURNS TABLE(user_id uuid, persona text, display_name text, avatar_url text, handle text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT l.user_id, l.persona::text, p.display_name,
    COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
    p.handle, l.created_at
  FROM public.card_likes l
  JOIN public.profiles p ON p.id = l.user_id
  LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
  LEFT JOIN public.doctors d ON d.id = da.doctor_id
  WHERE l.card_id = p_card_id
  ORDER BY l.created_at DESC LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_recent_card_likers(bigint, integer) TO authenticated, anon;
