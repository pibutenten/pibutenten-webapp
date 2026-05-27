-- 0175_top_rpcs_include_deleted.sql
--
-- 2026-05-28 — 활동 통계 KPI ↔ TOP 리스트 정합. 사용자 결정 옵션 A.
--
-- ── 배경 ───────────────────────────────────────────────────────────────────
-- 활동 통계 KPI ("좋아요 2", "조회수 99" 등) 는 card_likes/card_views 테이블의
-- 24h count 만 집계 → cards.deleted_at 무관하게 카운트.
--
-- 반면 TOP RPC 6개 (get_top_cards_by_{comments,likes,saves,shares,views}_inner +
-- get_top_new_cards_inner) 는 `card_likes JOIN cards WHERE c.deleted_at IS NULL`
-- 패턴이라 **삭제된 카드의 활동을 빼고 집계** → KPI 카운트는 있는데 클릭하면
-- "해당 기간에 데이터가 없습니다" 표시.
--
-- 실제 production 데이터 (2026-05-28 검증):
--   - 24h 좋아요 2건 모두 card_id=2319 (이미 deleted_at=2026-05-27 08:22)
--   - get_top_cards_by_likes_inner(1,10,0,NULL,NULL) → []
--   - 사용자에게 보이는 증상: KPI "좋아요 2" + TOP "데이터 없음".
--
-- ── 본 마이그레이션 행동 ──────────────────────────────────────────────────────
--   (1) 7개 _inner 함수의 `WHERE c.deleted_at IS NULL` 절 제거 + RETURNS TABLE
--       에 `deleted_at timestamptz` 컬럼 추가 + SELECT 절에 c.deleted_at 포함.
--   (2) 7개 wrapper 함수의 RETURNS TABLE 에 `deleted_at timestamptz` 동일 추가.
--       본문 (RETURN QUERY SELECT * FROM ..._inner) 변경 없음.
--   (3) NOTIFY pgrst 'reload schema' + 'reload config' 양방향.
--
-- 회귀 위협:
--   - 클라이언트 (StatsListClient) 는 새 deleted_at 컬럼을 ignore 해도 동작 동일.
--     UI 배지는 추가 commit 에서 처리 (시그니처는 미리 갖추되 UI 점진 적용 가능).
--   - get_top_new_cards 는 `c.status = 'published'` 는 유지 — admin 이 "발행됐던
--     모든 신규 글" 을 추적할 수 있고, draft/pending 은 별도 메뉴에서 본다.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── (A) get_top_cards_by_comments_inner ─────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_cards_by_comments_inner(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_comments_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid,
  p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text,
  cnt bigint, deleted_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT cm.card_id, COUNT(*)::bigint AS c
      FROM public.comments cm, bounds b
     WHERE cm.created_at >= b.since AND cm.status = 'visible'
     GROUP BY cm.card_id
  )
  SELECT c.id AS card_id, c.title, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle,
         a.c AS cnt, c.deleted_at
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE -- 0175: c.deleted_at IS NULL 제거 (KPI 정합). UI 가 deleted_at 으로 배지.
     (
       (p_doctor_id IS NULL AND p_author_profile_id IS NULL)
       OR c.doctor_id = p_doctor_id
       OR c.author_id = p_author_profile_id
     )
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$function$;

-- ── (B) get_top_cards_by_likes_inner ────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_cards_by_likes_inner(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_likes_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid,
  p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text,
  cnt bigint, deleted_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT l.card_id, COUNT(DISTINCT l.user_id)::bigint AS c
      FROM public.card_likes l, bounds b
     WHERE l.created_at >= b.since AND l.user_id IS NOT NULL
     GROUP BY l.card_id
  )
  SELECT c.id AS card_id, c.title, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle,
         a.c AS cnt, c.deleted_at
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE
     (
       (p_doctor_id IS NULL AND p_author_profile_id IS NULL)
       OR c.doctor_id = p_doctor_id
       OR c.author_id = p_author_profile_id
     )
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$function$;

-- ── (C) get_top_cards_by_saves_inner ────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_cards_by_saves_inner(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_saves_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid,
  p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text,
  cnt bigint, deleted_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT s.card_id, COUNT(DISTINCT s.user_id)::bigint AS c
      FROM public.card_saves s, bounds b
     WHERE s.created_at >= b.since AND s.user_id IS NOT NULL
     GROUP BY s.card_id
  )
  SELECT c.id AS card_id, c.title, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle,
         a.c AS cnt, c.deleted_at
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE
     (
       (p_doctor_id IS NULL AND p_author_profile_id IS NULL)
       OR c.doctor_id = p_doctor_id
       OR c.author_id = p_author_profile_id
     )
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$function$;

-- ── (D) get_top_cards_by_shares_inner ───────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_cards_by_shares_inner(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_shares_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid,
  p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text,
  cnt bigint, deleted_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT s.card_id,
           COUNT(DISTINCT COALESCE(s.user_id::text, s.session_id))::bigint AS c
      FROM public.card_shares s, bounds b
     WHERE s.created_at >= b.since
       AND (s.user_id IS NOT NULL OR s.session_id IS NOT NULL)
     GROUP BY s.card_id
  )
  SELECT c.id AS card_id, c.title, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle,
         a.c AS cnt, c.deleted_at
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE
     (
       (p_doctor_id IS NULL AND p_author_profile_id IS NULL)
       OR c.doctor_id = p_doctor_id
       OR c.author_id = p_author_profile_id
     )
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$function$;

-- ── (E) get_top_cards_by_views_inner ────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_cards_by_views_inner(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_views_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid,
  p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text,
  cnt bigint, deleted_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT v.card_id,
           COUNT(DISTINCT COALESCE(v.user_id::text, v.session_id))::bigint AS c
      FROM public.card_views v, bounds b
     WHERE v.created_at >= b.since
       AND (v.user_id IS NOT NULL OR v.session_id IS NOT NULL)
     GROUP BY v.card_id
  )
  SELECT c.id AS card_id, c.title, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle,
         a.c AS cnt, c.deleted_at
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE
     (
       (p_doctor_id IS NULL AND p_author_profile_id IS NULL)
       OR c.doctor_id = p_doctor_id
       OR c.author_id = p_author_profile_id
     )
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$function$;

-- ── (F) get_top_new_cards_inner ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_new_cards_inner(integer, integer, integer);
CREATE OR REPLACE FUNCTION public.get_top_new_cards_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text,
  created_at timestamptz, deleted_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  )
  SELECT c.id, c.title, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle,
         c.created_at, c.deleted_at
    FROM public.cards c
    CROSS JOIN bounds b
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE c.created_at >= b.since
     AND c.status = 'published'
     -- 0175: c.deleted_at IS NULL 제거. status='published' 는 유지 (draft/pending 은 별도 메뉴).
   ORDER BY c.created_at DESC
   LIMIT p_limit OFFSET p_offset;
$function$;

-- ── (G~L) wrapper 6개 — RETURNS TABLE 에 deleted_at 컬럼 추가 ───────────────
DROP FUNCTION IF EXISTS public.get_top_cards_by_comments(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_comments(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid, p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text,
  cnt bigint, deleted_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_doctor_id IS NULL AND p_author_profile_id IS NULL THEN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  ELSE
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_comments_inner(p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_comments(integer, integer, integer, uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_top_cards_by_likes(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_likes(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid, p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text,
  cnt bigint, deleted_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_doctor_id IS NULL AND p_author_profile_id IS NULL THEN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  ELSE
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_likes_inner(p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_likes(integer, integer, integer, uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_top_cards_by_saves(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_saves(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid, p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text,
  cnt bigint, deleted_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_doctor_id IS NULL AND p_author_profile_id IS NULL THEN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  ELSE
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_saves_inner(p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_saves(integer, integer, integer, uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_top_cards_by_shares(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_shares(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid, p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text,
  cnt bigint, deleted_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_doctor_id IS NULL AND p_author_profile_id IS NULL THEN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  ELSE
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_shares_inner(p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_shares(integer, integer, integer, uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_top_cards_by_views(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_views(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid, p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text,
  cnt bigint, deleted_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_doctor_id IS NULL AND p_author_profile_id IS NULL THEN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  ELSE
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_views_inner(p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_views(integer, integer, integer, uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_top_new_cards(integer, integer, integer);
CREATE OR REPLACE FUNCTION public.get_top_new_cards(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text,
  created_at timestamptz, deleted_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public.get_top_new_cards_inner(p_days, p_limit, p_offset);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_top_new_cards(integer, integer, integer) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
