-- 0186_phase2_user_id_to_profile_id.sql
-- ADR 0014 Phase 2 (2026-05-29): 인터랙션·통계 6 테이블의 user_id → profile_id RENAME.
--
-- 대상 (이 6개만):
--   daily_logins, site_visits, activity_points, card_shares, card_views, card_impressions
--
-- 범위 밖 (이번에 건드리지 않음):
--   - card_likes, card_saves, comment_likes (Phase 3)
--   - cards.author_id, comments.author_id (Phase 4 보류, ADR 0014 §6)
--
-- 단일 트랜잭션. 권한이 비는 순간 0.
-- 함수 인자명 (p_user_id), 변수명 (v_user, v_me) 은 그대로 유지 — 호출자 인터페이스 불변.
-- RETURNS TABLE 의 별칭 (profile_id) 도 그대로 — 클라이언트 응답 형식 불변.
-- 호환 별칭 (옛 user_id wrapper) 일체 도입 안 함.

BEGIN;

-- ============================================================================
-- 1. 컬럼 RENAME + FK RENAME + 인덱스 RENAME
-- ============================================================================
--
-- PostgreSQL 의 ALTER TABLE RENAME COLUMN 은 다음을 자동 갱신:
--   - 인덱스 정의의 컬럼 참조 (조건문 포함)
--   - FK constraint 본문의 컬럼 참조
-- 단 다음은 수동 갱신:
--   - constraint 이름 자체 (ALTER TABLE ... RENAME CONSTRAINT)
--   - 인덱스 이름 자체 (ALTER INDEX ... RENAME)
--   - 정책(RLS) 본문 (DROP + CREATE — 본 파일 §2)
--   - 함수 본문 (CREATE OR REPLACE — 본 파일 §3)
--   - 트리거 함수 본문 (해당 없음 — 3 트리거 모두 NEW.card_id 만 사용)

-- ── 1-1. daily_logins (FK + 복합 PK) ────────────────────────────────────────
ALTER TABLE public.daily_logins RENAME COLUMN user_id TO profile_id;
ALTER TABLE public.daily_logins
  RENAME CONSTRAINT daily_logins_user_id_fkey TO daily_logins_profile_id_fkey;
-- PK 인덱스 daily_logins_pkey 는 이름 유지 (테이블+pkey 의미).
-- 정의 (user_id, login_date) 의 컬럼 참조는 PostgreSQL 자동 갱신.

-- ── 1-2. site_visits (FK + 2 partial indexes) ──────────────────────────────
ALTER TABLE public.site_visits RENAME COLUMN user_id TO profile_id;
ALTER TABLE public.site_visits
  RENAME CONSTRAINT site_visits_user_id_fkey TO site_visits_profile_id_fkey;
ALTER INDEX public.idx_site_visits_user_created RENAME TO idx_site_visits_profile_created;
-- idx_site_visits_session_created (WHERE user_id IS NULL) 의 조건문 컬럼 참조는 자동 갱신.
-- 이름은 'session' 이라 유지.

-- ── 1-3. activity_points (FK + 2 indexes) ───────────────────────────────────
ALTER TABLE public.activity_points RENAME COLUMN user_id TO profile_id;
ALTER TABLE public.activity_points
  RENAME CONSTRAINT activity_points_user_id_fkey TO activity_points_profile_id_fkey;
ALTER INDEX public.idx_activity_points_user_action RENAME TO idx_activity_points_profile_action;
ALTER INDEX public.idx_activity_points_user_created RENAME TO idx_activity_points_profile_created;

-- ── 1-4. card_shares (FK 없음) ──────────────────────────────────────────────
ALTER TABLE public.card_shares RENAME COLUMN user_id TO profile_id;

-- ── 1-5. card_views (FK 없음) ───────────────────────────────────────────────
ALTER TABLE public.card_views RENAME COLUMN user_id TO profile_id;

-- ── 1-6. card_impressions (FK 없음) ─────────────────────────────────────────
ALTER TABLE public.card_impressions RENAME COLUMN user_id TO profile_id;


-- ============================================================================
-- 2. RLS 정책 재정의 (단일 트랜잭션 — 정책이 비는 순간 0)
-- ============================================================================
--
-- 본문에서 user_id 를 직접 참조하는 정책 2개만 재정의.
-- 그 외 (ap_admin_all, *_admin_select, *_anyone_insert, site_visits_anon_insert)
-- 는 user_id 직접 참조 없음 (is_admin() 또는 profiles 서브쿼리만) — 그대로.
--
-- 의미 보존: 의도적으로 USING 절을 100% 동일하게 두고 컬럼명만 치환.
-- 권한 과부여(=USING 절 완화) 없음. 권한 좁아짐도 없음 (RENAME 만으로 의미 동일).

-- ── 2-1. activity_points.ap_self_select ────────────────────────────────────
DROP POLICY IF EXISTS ap_self_select ON public.activity_points;
CREATE POLICY ap_self_select ON public.activity_points
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

-- ── 2-2. daily_logins.dl_self_select ───────────────────────────────────────
DROP POLICY IF EXISTS dl_self_select ON public.daily_logins;
CREATE POLICY dl_self_select ON public.daily_logins
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);


-- ============================================================================
-- 3. RPC 본문 재정의 (CREATE OR REPLACE — 시그니처 불변, 본문 컬럼 참조만 치환)
-- ============================================================================
--
-- 영향 RPC 10개. 각 함수의 인자명/변수명/RETURNS TABLE/SECURITY DEFINER/STABLE/
-- search_path 모두 production 정의 100% 동일하게 유지.
-- 본문에서 해당 6 테이블의 user_id 컬럼 참조 부분만 profile_id 로 치환.
--
-- Phase 3 소관 (card_likes/saves/comment_likes) 또는 Phase 4 소관 (cards.author_id)
-- 의 user_id/author_id 참조는 그대로 보존.

-- ── 3-1. award_daily_login (daily_logins 전용) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.award_daily_login(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID;
  v_today DATE;
  v_streak INT := 0;
  v_check_date DATE;
BEGIN
  v_user := COALESCE(p_user_id, auth.uid());
  IF v_user IS NULL THEN RETURN 0; END IF;
  v_today := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;

  IF NOT EXISTS(SELECT 1 FROM public.daily_logins WHERE profile_id = v_user AND login_date = v_today) THEN
    INSERT INTO public.daily_logins (profile_id, login_date) VALUES (v_user, v_today);
    PERFORM public.award_points(v_user, 'daily_login', 2, 'date', v_today::TEXT);
  END IF;

  v_check_date := v_today;
  LOOP
    EXIT WHEN NOT EXISTS(SELECT 1 FROM public.daily_logins WHERE profile_id = v_user AND login_date = v_check_date);
    v_streak := v_streak + 1;
    v_check_date := v_check_date - 1;
  END LOOP;

  IF v_streak > 0 AND v_streak % 7 = 0 THEN
    PERFORM public.award_points(v_user, 'streak_7', 10, 'streak', v_streak::TEXT);
  END IF;
  IF v_streak > 0 AND v_streak % 30 = 0 THEN
    PERFORM public.award_points(v_user, 'streak_30', 50, 'streak', v_streak::TEXT);
  END IF;

  RETURN v_streak;
END;
$function$;

-- ── 3-2. award_points (activity_points 전용) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.award_points(p_user_id uuid, p_action text, p_points numeric, p_ref_type text DEFAULT NULL::text, p_ref_id text DEFAULT NULL::text, p_daily_limit integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today_count INT;
  v_effective NUMERIC;
  v_score INT;
  v_level INT;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  v_effective := p_points;
  IF p_daily_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_today_count
    FROM public.activity_points
    WHERE profile_id = p_user_id
      AND action = p_action
      AND points > 0
      AND created_at > NOW() - INTERVAL '24 hours';
    IF v_today_count >= p_daily_limit THEN
      v_effective := 0;
    END IF;
  END IF;
  INSERT INTO public.activity_points (profile_id, action, points, ref_type, ref_id)
  VALUES (p_user_id, p_action, v_effective, p_ref_type, p_ref_id);

  SELECT COALESCE(SUM(points), 0)::INT INTO v_score
  FROM public.activity_points
  WHERE profile_id = p_user_id AND created_at > NOW() - INTERVAL '90 days';
  v_level := CASE
    WHEN v_score >= 2000 THEN 3
    WHEN v_score >= 500 THEN 2
    WHEN v_score >= 100 THEN 1
    ELSE 0 END;
  UPDATE public.profiles
  SET activity_score = v_score, level = v_level
  WHERE id = p_user_id;
END;
$function$;

-- ── 3-3. get_admin_kpi_inner (card_impressions + card_views + site_visits) ──
CREATE OR REPLACE FUNCTION public.get_admin_kpi_inner(p_days integer DEFAULT 1)
 RETURNS TABLE(visitors bigint, new_members bigint, views bigint, new_cards bigint, comments bigint, likes bigint, saves bigint, shares bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  ),
  events AS (
    SELECT profile_id, session_id, created_at FROM public.card_impressions
     WHERE created_at >= (SELECT since FROM bounds)
    UNION ALL
    SELECT profile_id, session_id, created_at FROM public.card_views
     WHERE created_at >= (SELECT since FROM bounds)
    UNION ALL
    SELECT profile_id, session_id, created_at FROM public.site_visits
     WHERE created_at >= (SELECT since FROM bounds)
  )
  SELECT
    (SELECT COUNT(DISTINCT (
        COALESCE(profile_id::text, session_id),
        (created_at AT TIME ZONE 'Asia/Seoul')::date
      )) FROM events WHERE COALESCE(profile_id::text, session_id) IS NOT NULL)::bigint AS visitors,
    (SELECT COUNT(*) FROM public.profiles
      WHERE created_at >= (SELECT since FROM bounds))::bigint AS new_members,
    (SELECT COUNT(*) FROM events)::bigint AS views,
    (SELECT COUNT(*) FROM public.cards
      WHERE created_at >= (SELECT since FROM bounds) AND deleted_at IS NULL)::bigint AS new_cards,
    (SELECT COUNT(*) FROM public.comments
      WHERE created_at >= (SELECT since FROM bounds))::bigint AS comments,
    (SELECT COUNT(*) FROM public.card_likes
      WHERE created_at >= (SELECT since FROM bounds))::bigint AS likes,
    (SELECT COUNT(*) FROM public.card_saves
      WHERE created_at >= (SELECT since FROM bounds))::bigint AS saves,
    (SELECT COUNT(*) FROM public.card_shares
      WHERE created_at >= (SELECT since FROM bounds))::bigint AS shares;
$function$;

-- ── 3-4. get_card_activity_users_inner (shares/views 분기만, likes/saves 보존) ─
CREATE OR REPLACE FUNCTION public.get_card_activity_users_inner(p_card_id bigint, p_kind text, p_limit integer DEFAULT 30, p_days integer DEFAULT 0)
 RETURNS TABLE(profile_id uuid, display_name text, handle text, avatar_url text, acted_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_since timestamptz := CASE
    WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
    ELSE now() - (p_days || ' days')::interval
  END;
BEGIN
  -- 0176: doctor_accounts LEFT JOIN 제거. profiles.doctor_id 로 doctors 직접 JOIN.
  -- ADR 0014 Phase 2 (0186): card_shares.user_id / card_views.user_id → profile_id.
  -- card_likes / card_saves 의 user_id 는 Phase 3 소관 — 그대로 보존.
  IF p_kind = 'likes' THEN
    RETURN QUERY
    SELECT DISTINCT ON (p.id)
      p.id, p.display_name, p.handle,
      COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
      l.created_at
    FROM public.card_likes l
    JOIN public.profiles p ON p.id = l.user_id
    LEFT JOIN public.doctors d ON d.id = p.doctor_id
    WHERE l.card_id = p_card_id
      AND l.created_at >= v_since
    ORDER BY p.id, l.created_at DESC
    LIMIT p_limit;

  ELSIF p_kind = 'saves' THEN
    RETURN QUERY
    SELECT DISTINCT ON (p.id)
      p.id, p.display_name, p.handle,
      COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
      s.created_at
    FROM public.card_saves s
    JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN public.doctors d ON d.id = p.doctor_id
    WHERE s.card_id = p_card_id
      AND s.created_at >= v_since
    ORDER BY p.id, s.created_at DESC
    LIMIT p_limit;

  ELSIF p_kind = 'shares' THEN
    RETURN QUERY
    SELECT DISTINCT ON (p.id)
      p.id, p.display_name, p.handle,
      COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
      sh.created_at
    FROM public.card_shares sh
    JOIN public.profiles p ON p.id = sh.profile_id
    LEFT JOIN public.doctors d ON d.id = p.doctor_id
    WHERE sh.card_id = p_card_id
      AND sh.profile_id IS NOT NULL
      AND sh.created_at >= v_since
    ORDER BY p.id, sh.created_at DESC
    LIMIT p_limit;

  ELSIF p_kind = 'views' THEN
    RETURN QUERY
    SELECT DISTINCT ON (p.id)
      p.id, p.display_name, p.handle,
      COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
      v.created_at
    FROM public.card_views v
    JOIN public.profiles p ON p.id = v.profile_id
    LEFT JOIN public.doctors d ON d.id = p.doctor_id
    WHERE v.card_id = p_card_id
      AND v.profile_id IS NOT NULL
      AND v.created_at >= v_since
    ORDER BY p.id, v.created_at DESC
    LIMIT p_limit;

  ELSE
    RETURN;
  END IF;
END;
$function$;

-- ── 3-5. get_doctor_kpi_inner (views/shares 분기만, cards.author_id 보존) ───
CREATE OR REPLACE FUNCTION public.get_doctor_kpi_inner(p_doctor_id uuid, p_profile_id uuid, p_days integer DEFAULT 7)
 RETURNS TABLE(views_received bigint, comments_received bigint, saves_received bigint, shares_received bigint, published_total bigint, pending_review bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  ),
  -- 본인 카드 id 집합 (author_id OR doctor_id 매칭, deleted_at 제외)
  -- cards.author_id 는 Phase 4 보류 — 그대로.
  my_cards AS (
    SELECT id
      FROM public.cards
     WHERE (author_id = p_profile_id OR doctor_id = p_doctor_id)
       AND deleted_at IS NULL
  ),
  -- 1. views per-card (TOP 페이지와 동일 정의)
  -- card_views.user_id → profile_id (Phase 2, 0186)
  views_per_card AS (
    SELECT v.card_id,
           COUNT(DISTINCT COALESCE(v.profile_id::text, v.session_id))::bigint AS c
      FROM public.card_views v, bounds b
     WHERE v.created_at >= b.since
       AND v.card_id IN (SELECT id FROM my_cards)
       AND (v.profile_id IS NOT NULL OR v.session_id IS NOT NULL)
     GROUP BY v.card_id
  ),
  -- 4. shares per-card (TOP 페이지와 동일 정의)
  -- card_shares.user_id → profile_id (Phase 2, 0186)
  shares_per_card AS (
    SELECT s.card_id,
           COUNT(DISTINCT COALESCE(s.profile_id::text, s.session_id))::bigint AS c
      FROM public.card_shares s, bounds b
     WHERE s.created_at >= b.since
       AND s.card_id IN (SELECT id FROM my_cards)
       AND (s.profile_id IS NOT NULL OR s.session_id IS NOT NULL)
     GROUP BY s.card_id
  )
  SELECT
    COALESCE((SELECT SUM(c) FROM views_per_card), 0)::bigint AS views_received,
    (SELECT count(*)::bigint
       FROM public.comments c, bounds b
      WHERE c.created_at >= b.since
        AND c.status = 'visible'
        AND c.card_id IN (SELECT id FROM my_cards)) AS comments_received,
    (SELECT count(*)::bigint
       FROM public.card_saves s, bounds b
      WHERE s.created_at >= b.since
        AND s.card_id IN (SELECT id FROM my_cards)) AS saves_received,
    COALESCE((SELECT SUM(c) FROM shares_per_card), 0)::bigint AS shares_received,
    (SELECT count(*)::bigint
       FROM public.cards c
      WHERE (c.author_id = p_profile_id OR c.doctor_id = p_doctor_id)
        AND c.status = 'published'
        AND c.deleted_at IS NULL) AS published_total,
    (SELECT count(*)::bigint
       FROM public.cards c
      WHERE (c.author_id = p_profile_id OR c.doctor_id = p_doctor_id)
        AND c.status = 'pending_review'
        AND c.deleted_at IS NULL) AS pending_review;
$function$;

-- ── 3-6. get_my_stats (daily_logins + activity_points 분기만, card_likes/cards/comments 보존) ─
CREATE OR REPLACE FUNCTION public.get_my_stats()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_me uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_streak int := 0;
  v_check date;
  v_score int; v_level int;
  v_posts_count int;
  v_likes_received bigint; v_comments_received bigint; v_shares_received bigint;
  v_likes_given bigint; v_comments_given bigint;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  v_me := COALESCE(public.current_active_profile_id(), v_uid);

  -- daily_logins.user_id → profile_id (Phase 2, 0186)
  v_check := v_today;
  LOOP
    EXIT WHEN NOT EXISTS(SELECT 1 FROM public.daily_logins WHERE profile_id = v_me AND login_date = v_check);
    v_streak := v_streak + 1;
    v_check := v_check - 1;
  END LOOP;

  -- activity_points.user_id → profile_id (Phase 2, 0186)
  SELECT COALESCE(SUM(points), 0)::int INTO v_score
  FROM public.activity_points WHERE profile_id = v_me AND created_at > now() - interval '90 days';
  v_level := CASE WHEN v_score >= 2000 THEN 3 WHEN v_score >= 500 THEN 2 WHEN v_score >= 100 THEN 1 ELSE 0 END;

  -- cards.author_id 는 Phase 4 보류 — 그대로.
  -- comments.author_id 는 Phase 4 보류 — 그대로.
  -- card_likes.user_id 는 Phase 3 소관 — 그대로.
  SELECT COUNT(*) INTO v_posts_count
  FROM public.cards WHERE author_id = v_me AND status = 'published';
  SELECT COALESCE(SUM(like_count), 0) INTO v_likes_received
  FROM public.cards WHERE author_id = v_me;
  SELECT COUNT(*) INTO v_comments_received
  FROM public.comments c JOIN public.cards q ON q.id = c.card_id
  WHERE q.author_id = v_me AND c.author_id IS DISTINCT FROM v_me AND c.status = 'visible';
  SELECT COALESCE(SUM(share_count), 0) INTO v_shares_received
  FROM public.cards WHERE author_id = v_me;
  SELECT COUNT(*) INTO v_likes_given FROM public.card_likes WHERE user_id = v_me;
  SELECT COUNT(*) INTO v_comments_given FROM public.comments WHERE author_id = v_me AND status = 'visible';

  RETURN json_build_object(
    'score', v_score, 'level', v_level, 'streak', v_streak,
    'posts_count', v_posts_count,
    'likes_received', v_likes_received,
    'comments_received', v_comments_received,
    'shares_received', v_shares_received,
    'likes_given', v_likes_given,
    'comments_given', v_comments_given
  );
END;
$function$;

-- ── 3-7. get_top_cards_by_shares_inner (card_shares.user_id 만, cards.author_id 보존) ─
CREATE OR REPLACE FUNCTION public.get_top_cards_by_shares_inner(p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_doctor_id uuid DEFAULT NULL::uuid, p_author_profile_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(card_id bigint, title text, shortcode text, author_id uuid, author_name text, author_handle text, cnt bigint, deleted_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  -- card_shares.user_id → profile_id (Phase 2, 0186)
  agg AS (
    SELECT s.card_id,
           COUNT(DISTINCT COALESCE(s.profile_id::text, s.session_id))::bigint AS c
      FROM public.card_shares s, bounds b
     WHERE s.created_at >= b.since
       AND (s.profile_id IS NOT NULL OR s.session_id IS NOT NULL)
     GROUP BY s.card_id
  )
  -- cards.author_id 는 Phase 4 보류 — 그대로.
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

-- ── 3-8. get_top_cards_by_views_inner (card_views.user_id 만, cards.author_id 보존) ─
CREATE OR REPLACE FUNCTION public.get_top_cards_by_views_inner(p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_doctor_id uuid DEFAULT NULL::uuid, p_author_profile_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(card_id bigint, title text, shortcode text, author_id uuid, author_name text, author_handle text, cnt bigint, deleted_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  -- card_views.user_id → profile_id (Phase 2, 0186)
  agg AS (
    SELECT v.card_id,
           COUNT(DISTINCT COALESCE(v.profile_id::text, v.session_id))::bigint AS c
      FROM public.card_views v, bounds b
     WHERE v.created_at >= b.since
       AND (v.profile_id IS NOT NULL OR v.session_id IS NOT NULL)
     GROUP BY v.card_id
  )
  -- cards.author_id 는 Phase 4 보류 — 그대로.
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

-- ── 3-9. get_top_visitors_inner (card_impressions + card_views 의 user_id → profile_id) ─
-- RETURNS TABLE 의 첫 컬럼 alias 는 이미 'profile_id' — 클라이언트 응답 불변.
CREATE OR REPLACE FUNCTION public.get_top_visitors_inner(p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(profile_id uuid, display_name text, handle text, visit_count bigint, last_visit_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  ),
  events AS (
    SELECT profile_id, session_id, created_at FROM public.card_impressions
     WHERE created_at >= (SELECT since FROM bounds)
    UNION ALL
    SELECT profile_id, session_id, created_at FROM public.card_views
     WHERE created_at >= (SELECT since FROM bounds)
  ),
  logged_in AS (
    SELECT p.id AS profile_id,
           p.display_name,
           p.handle,
           COUNT(DISTINCT (e.created_at AT TIME ZONE 'Asia/Seoul')::date)::bigint AS visit_count,
           MAX(e.created_at) AS last_visit_at
      FROM events e
      JOIN public.profiles p ON p.id = e.profile_id
     WHERE e.profile_id IS NOT NULL
     GROUP BY p.id, p.display_name, p.handle
  ),
  anon AS (
    -- 0172: 옛 한글 라벨 '비로그인 방문자' 제거. profile_id IS NULL 이 곧 비로그인 신호.
    -- UI 가 NULL 을 받으면 "비로그인" 으로 표시 (StatsListClient.tsx).
    SELECT NULL::uuid AS profile_id,
           NULL::text AS display_name,
           NULL::text AS handle,
           COUNT(DISTINCT (e.session_id, (e.created_at AT TIME ZONE 'Asia/Seoul')::date))::bigint AS visit_count,
           MAX(e.created_at) AS last_visit_at
      FROM events e
     WHERE e.profile_id IS NULL AND e.session_id IS NOT NULL
     HAVING COUNT(DISTINCT (e.session_id, (e.created_at AT TIME ZONE 'Asia/Seoul')::date)) > 0
  )
  SELECT * FROM (
    SELECT * FROM anon
    UNION ALL
    SELECT * FROM logged_in
  ) all_rows
  -- 비로그인 행은 profile_id IS NULL 임. ORDER BY (profile_id IS NOT NULL) ASC 로 anon 우선
  ORDER BY (profile_id IS NOT NULL) ASC,
           visit_count DESC,
           last_visit_at DESC NULLS LAST,
           display_name
  LIMIT p_limit OFFSET p_offset;
$function$;

-- ── 3-10. get_users_kpi_inner (card_impressions + card_views 의 user_id 만, 나머지 보존) ─
-- RETURNS TABLE 의 첫 컬럼 alias 는 이미 'profile_id' — 클라이언트 응답 불변.
CREATE OR REPLACE FUNCTION public.get_users_kpi_inner(p_days integer DEFAULT 7)
 RETURNS TABLE(profile_id uuid, visit_sessions bigint, views_received bigint, comments_written bigint, likes_received bigint, shares_received bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  ),
  -- 회원별 방문 일수 (KST 날짜 distinct). 같은 날 여러 번 들러도 1.
  -- card_impressions.user_id / card_views.user_id → profile_id (Phase 2, 0186)
  vs AS (
    SELECT e.profile_id AS pid,
           COUNT(DISTINCT (e.created_at AT TIME ZONE 'Asia/Seoul')::date)::bigint AS d
      FROM (
        SELECT profile_id, created_at FROM public.card_impressions
         WHERE created_at >= (SELECT since FROM bounds) AND profile_id IS NOT NULL
         UNION ALL
        SELECT profile_id, created_at FROM public.card_views
         WHERE created_at >= (SELECT since FROM bounds) AND profile_id IS NOT NULL
      ) e
     GROUP BY e.profile_id
  ),
  -- cards.author_id 는 Phase 4 보류 — 그대로.
  vw AS (
    SELECT c.author_id AS pid, COUNT(*)::bigint AS c
      FROM public.card_views v JOIN public.cards c ON c.id = v.card_id, bounds b
     WHERE v.created_at >= b.since AND c.author_id IS NOT NULL
     GROUP BY c.author_id
  ),
  -- comments.author_id 는 Phase 4 보류 — 그대로.
  cw AS (
    SELECT cm.author_id AS pid, COUNT(*)::bigint AS c
      FROM public.comments cm, bounds b
     WHERE cm.created_at >= b.since AND cm.status = 'visible' AND cm.author_id IS NOT NULL
     GROUP BY cm.author_id
  ),
  lk AS (
    SELECT c.author_id AS pid, COUNT(*)::bigint AS c
      FROM public.card_likes l JOIN public.cards c ON c.id = l.card_id, bounds b
     WHERE l.created_at >= b.since AND c.author_id IS NOT NULL
     GROUP BY c.author_id
  ),
  sh AS (
    SELECT c.author_id AS pid, COUNT(*)::bigint AS c
      FROM public.card_shares s JOIN public.cards c ON c.id = s.card_id, bounds b
     WHERE s.created_at >= b.since AND c.author_id IS NOT NULL
     GROUP BY c.author_id
  ),
  pids AS (
    SELECT pid FROM vs
    UNION SELECT pid FROM vw
    UNION SELECT pid FROM cw
    UNION SELECT pid FROM lk
    UNION SELECT pid FROM sh
  )
  SELECT
    p.pid AS profile_id,
    COALESCE(vs.d, 0)::bigint AS visit_sessions,
    COALESCE(vw.c, 0)::bigint AS views_received,
    COALESCE(cw.c, 0)::bigint AS comments_written,
    COALESCE(lk.c, 0)::bigint AS likes_received,
    COALESCE(sh.c, 0)::bigint AS shares_received
  FROM pids p
  LEFT JOIN vs ON vs.pid = p.pid
  LEFT JOIN vw ON vw.pid = p.pid
  LEFT JOIN cw ON cw.pid = p.pid
  LEFT JOIN lk ON lk.pid = p.pid
  LEFT JOIN sh ON sh.pid = p.pid;
$function$;


-- ============================================================================
-- 4. 트랜잭션 내부 검증 (실패 시 자동 ROLLBACK)
-- ============================================================================
DO $$
DECLARE
  v_missing text[];
  v_count int;
BEGIN
  -- 4-1. 6 테이블의 profile_id 컬럼 존재 확인 + 옛 user_id 컬럼 부재 확인
  v_missing := ARRAY[]::text[];
  FOR v_count IN
    SELECT 1
    FROM (VALUES
      ('daily_logins'), ('site_visits'), ('activity_points'),
      ('card_shares'), ('card_views'), ('card_impressions')
    ) AS t(tname)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t.tname AND column_name = 'profile_id'
    )
  LOOP
    v_missing := array_append(v_missing, 'missing profile_id');
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Phase 2 verification failed: %', v_missing;
  END IF;

  -- 4-2. 옛 user_id 컬럼이 6 테이블에 남아있지 않은지 확인
  FOR v_count IN
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('daily_logins','site_visits','activity_points','card_shares','card_views','card_impressions')
      AND column_name = 'user_id'
  LOOP
    RAISE EXCEPTION 'Phase 2 verification failed: legacy user_id column still exists in 6 tables';
  END LOOP;

  -- 4-3. RLS 정책 2개 재생성 확인
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_points' AND policyname = 'ap_self_select'
  ) THEN
    RAISE EXCEPTION 'Phase 2 verification failed: ap_self_select policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'daily_logins' AND policyname = 'dl_self_select'
  ) THEN
    RAISE EXCEPTION 'Phase 2 verification failed: dl_self_select policy missing';
  END IF;

  RAISE NOTICE 'Phase 2 verification passed: 6 tables migrated to profile_id, RLS policies recreated.';
END;
$$;

-- PostgREST schema cache reload (마이그 적용 후 자동 반영)
NOTIFY pgrst, 'reload schema';

COMMIT;
