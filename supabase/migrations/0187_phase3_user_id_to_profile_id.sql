-- 0187_phase3_user_id_to_profile_id.sql
-- ADR 0014 Phase 3 (2026-05-29): 좋아요·저장 3 테이블의 user_id → profile_id RENAME.
--
-- 대상 (이 3개만):
--   card_likes, card_saves, comment_likes
--
-- 범위 밖 (이번에 건드리지 않음):
--   - cards.author_id, comments.author_id (Phase 4 보류, ADR 0014 §6)
--   - Phase 2 의 6 테이블 (이미 적용 완료, 0186)
--
-- 단일 트랜잭션. 권한 비는 순간 0.
-- 함수 인자명 (p_identity_id 등), 변수명 (v_profile_id, v_me) 은 그대로 — 호출자 인터페이스 불변.
-- RETURNS TABLE 별칭 변경:
--   get_recent_likers / get_recent_card_likers_batch — `user_id uuid` → `profile_id uuid`.
--   클라이언트 코드 (LikersDialog/RecentLikers/likers-batch) 도 같은 commit 에서 정합.
-- 트리거 함수 3개 (card_likes_sync, cards_save_count_sync, comments_like_count_sync)
--   는 NEW.card_id / NEW.comment_id 만 사용 — 변경 불필요.
-- on_card_like_for_notification 은 NEW.user_id 참조 → NEW.profile_id 로 변경.

BEGIN;

-- ============================================================================
-- 1. 컬럼 RENAME + FK RENAME + 인덱스 RENAME
-- ============================================================================

-- ── 1-1. comment_likes (row 24) ─────────────────────────────────────────────
ALTER TABLE public.comment_likes RENAME COLUMN user_id TO profile_id;
ALTER TABLE public.comment_likes
  RENAME CONSTRAINT comment_likes_user_id_fkey TO comment_likes_profile_id_fkey;
ALTER INDEX public.idx_comment_likes_user RENAME TO idx_comment_likes_profile;
-- PK 인덱스 comment_likes_pkey (comment_id, user_id) → 본문 자동 갱신, 이름 유지.

-- ── 1-2. card_saves (row 37) ────────────────────────────────────────────────
ALTER TABLE public.card_saves RENAME COLUMN user_id TO profile_id;
ALTER TABLE public.card_saves
  RENAME CONSTRAINT card_saves_user_id_fkey TO card_saves_profile_id_fkey;
ALTER INDEX public.idx_qa_saves_user_persona RENAME TO idx_qa_saves_profile_persona;
-- PK 인덱스 card_saves_pkey (card_id, user_id) → 본문 자동 갱신.

-- ── 1-3. card_likes (row 98) ────────────────────────────────────────────────
ALTER TABLE public.card_likes RENAME COLUMN user_id TO profile_id;
ALTER TABLE public.card_likes
  RENAME CONSTRAINT card_likes_user_id_fkey TO card_likes_profile_id_fkey;
ALTER INDEX public.card_likes_user_idx RENAME TO card_likes_profile_idx;
-- PK 인덱스 card_likes_pkey (card_id, user_id) → 본문 자동 갱신.


-- ============================================================================
-- 2. RLS 정책 재정의 (단일 트랜잭션 — 정책 비는 순간 0)
-- ============================================================================
-- 본문에서 user_id 를 직접 참조하는 8개 정책만 재정의.
-- card_likes_select 는 USING = true 라 user_id 참조 없음 — 변경 불필요.
-- 의미 100% 동일 (컬럼명만 치환). 권한 좁아짐도 넓어짐도 없음.

-- ── 2-1. card_likes (2개) ───────────────────────────────────────────────────
DROP POLICY IF EXISTS card_likes_delete ON public.card_likes;
CREATE POLICY card_likes_delete ON public.card_likes
  FOR DELETE TO authenticated
  USING (
    (auth.uid() IS NOT NULL)
    AND (profile_id = COALESCE(current_active_profile_id(), auth.uid()))
  );

DROP POLICY IF EXISTS card_likes_insert ON public.card_likes;
CREATE POLICY card_likes_insert ON public.card_likes
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() IS NOT NULL)
    AND (profile_id = COALESCE(current_active_profile_id(), auth.uid()))
  );

-- ── 2-2. card_saves (3개) ───────────────────────────────────────────────────
DROP POLICY IF EXISTS card_saves_delete ON public.card_saves;
CREATE POLICY card_saves_delete ON public.card_saves
  FOR DELETE TO authenticated
  USING (
    (auth.uid() IS NOT NULL)
    AND (profile_id = COALESCE(current_active_profile_id(), auth.uid()))
  );

DROP POLICY IF EXISTS card_saves_insert ON public.card_saves;
CREATE POLICY card_saves_insert ON public.card_saves
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() IS NOT NULL)
    AND (profile_id = COALESCE(current_active_profile_id(), auth.uid()))
  );

DROP POLICY IF EXISTS card_saves_select ON public.card_saves;
CREATE POLICY card_saves_select ON public.card_saves
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR (
      (auth.uid() IS NOT NULL)
      AND (profile_id = COALESCE(current_active_profile_id(), auth.uid()))
    )
  );

-- ── 2-3. comment_likes (3개) ────────────────────────────────────────────────
DROP POLICY IF EXISTS comment_likes_delete ON public.comment_likes;
CREATE POLICY comment_likes_delete ON public.comment_likes
  FOR DELETE TO authenticated
  USING (
    is_admin()
    OR (
      (auth.uid() IS NOT NULL)
      AND (profile_id = COALESCE(current_active_profile_id(), auth.uid()))
    )
  );

DROP POLICY IF EXISTS comment_likes_insert ON public.comment_likes;
CREATE POLICY comment_likes_insert ON public.comment_likes
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() IS NOT NULL)
    AND (profile_id = COALESCE(current_active_profile_id(), auth.uid()))
  );

DROP POLICY IF EXISTS comment_likes_select ON public.comment_likes;
CREATE POLICY comment_likes_select ON public.comment_likes
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR (
      (auth.uid() IS NOT NULL)
      AND (profile_id = COALESCE(current_active_profile_id(), auth.uid()))
    )
  );


-- ============================================================================
-- 3. RPC 본문 재정의 (CREATE OR REPLACE)
-- ============================================================================
-- 인자명·변수명·SECURITY DEFINER·STABLE·search_path 모두 production 정의 100% 유지.
-- 본문에서 3 테이블의 user_id 컬럼 참조 부분만 profile_id 로 치환.
-- RETURNS TABLE 별칭 user_id → profile_id (get_recent_likers / get_recent_card_likers_batch).

-- ── 3-1. toggle_card_like (card_likes 전용) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_card_like(p_card_id integer, p_identity_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(liked boolean, like_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid; v_profile_id uuid; v_count int; v_liked boolean;
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_identity_id IS NOT NULL THEN
    -- 클라이언트 명시 — 묶음 검증 (위조 차단)
    SELECT p.id INTO v_profile_id FROM public.profiles p
     WHERE p.id = p_identity_id AND (p.id = v_auth OR p.auth_user_id = v_auth) LIMIT 1;
    IF v_profile_id IS NULL THEN
      v_profile_id := COALESCE(public.current_active_profile_id(), v_auth);
    END IF;
  ELSE
    v_profile_id := COALESCE(public.current_active_profile_id(), v_auth);
  END IF;
  -- ADR 0014 Phase 3 (0187): card_likes.user_id → profile_id.
  IF EXISTS (SELECT 1 FROM public.card_likes WHERE card_id = p_card_id AND profile_id = v_profile_id) THEN
    DELETE FROM public.card_likes WHERE card_id = p_card_id AND profile_id = v_profile_id;
    v_liked := false;
  ELSE
    INSERT INTO public.card_likes (card_id, profile_id) VALUES (p_card_id, v_profile_id)
      ON CONFLICT DO NOTHING;
    v_liked := true;
  END IF;
  SELECT c.like_count INTO v_count FROM public.cards c WHERE c.id = p_card_id;
  RETURN QUERY SELECT v_liked, COALESCE(v_count, 0);
END;
$function$;

-- ── 3-2. toggle_card_save (card_saves 전용) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_card_save(p_card_id bigint, p_identity_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(saved boolean, save_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid; v_profile_id uuid; v_count int; v_saved boolean;
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_identity_id IS NOT NULL THEN
    SELECT p.id INTO v_profile_id FROM public.profiles p
     WHERE p.id = p_identity_id AND (p.id = v_auth OR p.auth_user_id = v_auth) LIMIT 1;
    IF v_profile_id IS NULL THEN
      v_profile_id := COALESCE(public.current_active_profile_id(), v_auth);
    END IF;
  ELSE
    v_profile_id := COALESCE(public.current_active_profile_id(), v_auth);
  END IF;
  -- ADR 0014 Phase 3 (0187): card_saves.user_id → profile_id.
  IF EXISTS (SELECT 1 FROM public.card_saves WHERE card_id = p_card_id AND profile_id = v_profile_id) THEN
    DELETE FROM public.card_saves WHERE card_id = p_card_id AND profile_id = v_profile_id;
    v_saved := false;
  ELSE
    INSERT INTO public.card_saves (card_id, profile_id) VALUES (p_card_id, v_profile_id)
      ON CONFLICT DO NOTHING;
    v_saved := true;
  END IF;
  SELECT c.save_count INTO v_count FROM public.cards c WHERE c.id = p_card_id;
  RETURN QUERY SELECT v_saved, COALESCE(v_count, 0);
END;
$function$;

-- ── 3-3. toggle_comment_like (comment_likes 전용) ───────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_comment_like(p_comment_id bigint, p_identity_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(liked boolean, like_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_target uuid;
  v_count integer;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF p_identity_id IS NOT NULL THEN
    -- 묶음 검증 (위조 차단) — 위조면 active 로 fallback
    IF NOT (p_identity_id = ANY(SELECT public.same_group_profile_ids(v_auth))) THEN
      v_target := COALESCE(public.current_active_profile_id(), v_auth);
    ELSE
      v_target := p_identity_id;
    END IF;
  ELSE
    v_target := COALESCE(public.current_active_profile_id(), v_auth);
  END IF;

  -- ADR 0014 Phase 3 (0187): comment_likes.user_id → profile_id.
  IF EXISTS (SELECT 1 FROM public.comment_likes WHERE comment_id = p_comment_id AND profile_id = v_target) THEN
    DELETE FROM public.comment_likes WHERE comment_id = p_comment_id AND profile_id = v_target;
    SELECT c.like_count INTO v_count FROM public.comments c WHERE c.id = p_comment_id;
    RETURN QUERY SELECT false, v_count;
  ELSE
    INSERT INTO public.comment_likes (comment_id, profile_id) VALUES (p_comment_id, v_target);
    SELECT c.like_count INTO v_count FROM public.comments c WHERE c.id = p_comment_id;
    RETURN QUERY SELECT true, v_count;
  END IF;
END;
$function$;

-- ── 3-4. get_recent_likers (RETURNS TABLE 별칭 user_id → profile_id) ────────
-- DROP 필수: RETURNS TABLE 첫 컬럼명 변경은 CREATE OR REPLACE 로 불가 (42P13).
DROP FUNCTION IF EXISTS public.get_recent_likers(bigint, integer);
CREATE FUNCTION public.get_recent_likers(p_qa_id bigint, p_limit integer DEFAULT 5)
 RETURNS TABLE(profile_id uuid, persona text, display_name text, avatar_url text, handle text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    l.profile_id,
    -- 0176: card_likes.persona 컬럼은 0090 에서 폐기. 옛 함수 정의는 lazy 라 남아있던 잔재.
    --   시그니처 (RETURNS TABLE persona text) 호환 위해 NULL::text 반환.
    NULL::text AS persona,
    p.display_name,
    -- 0176: doctor row 면 doctors.photo_url 우선 (SSOT). doctor_accounts JOIN 폐기.
    COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
    p.handle,
    l.created_at
  FROM public.card_likes l
  JOIN public.profiles p ON p.id = l.profile_id
  LEFT JOIN public.doctors d ON d.id = p.doctor_id
  WHERE l.card_id = p_qa_id
  ORDER BY l.created_at DESC
  LIMIT p_limit;
$function$;

-- ── 3-5. get_recent_card_likers_batch (RETURNS TABLE 별칭 user_id → profile_id) ─
-- DROP 필수: RETURNS TABLE 컬럼명 변경.
DROP FUNCTION IF EXISTS public.get_recent_card_likers_batch(bigint[], integer);
CREATE FUNCTION public.get_recent_card_likers_batch(p_card_ids bigint[], p_limit_per_card integer DEFAULT 3)
 RETURNS TABLE(card_id bigint, profile_id uuid, display_name text, avatar_url text, handle text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT card_id, profile_id, display_name, avatar_url, handle, created_at
  FROM (
    SELECT
      l.card_id,
      l.profile_id,
      p.display_name,
      -- 0176: doctor_accounts JOIN 폐기. profiles.doctor_id 로 doctors 직접 JOIN.
      COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
      p.handle,
      l.created_at,
      ROW_NUMBER() OVER (PARTITION BY l.card_id ORDER BY l.created_at DESC) AS rn
    FROM public.card_likes l
    JOIN public.profiles p ON p.id = l.profile_id
    LEFT JOIN public.doctors d ON d.id = p.doctor_id
    WHERE l.card_id = ANY(p_card_ids)
  ) ranked
  WHERE rn <= p_limit_per_card
  ORDER BY card_id, created_at DESC;
$function$;

-- ── 3-6. get_card_activity_users_inner (likes/saves 분기 정합, shares/views 보존) ─
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
  -- ADR 0014 Phase 2 (0186): card_shares/views 의 user_id → profile_id.
  -- ADR 0014 Phase 3 (0187): card_likes/saves 의 user_id → profile_id.
  IF p_kind = 'likes' THEN
    RETURN QUERY
    SELECT DISTINCT ON (p.id)
      p.id, p.display_name, p.handle,
      COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
      l.created_at
    FROM public.card_likes l
    JOIN public.profiles p ON p.id = l.profile_id
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
    JOIN public.profiles p ON p.id = s.profile_id
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

-- ── 3-7. get_my_stats (card_likes 부분만, cards/comments author_id 보존) ────
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
  SELECT COUNT(*) INTO v_posts_count
  FROM public.cards WHERE author_id = v_me AND status = 'published';
  SELECT COALESCE(SUM(like_count), 0) INTO v_likes_received
  FROM public.cards WHERE author_id = v_me;
  SELECT COUNT(*) INTO v_comments_received
  FROM public.comments c JOIN public.cards q ON q.id = c.card_id
  WHERE q.author_id = v_me AND c.author_id IS DISTINCT FROM v_me AND c.status = 'visible';
  SELECT COALESCE(SUM(share_count), 0) INTO v_shares_received
  FROM public.cards WHERE author_id = v_me;
  -- ADR 0014 Phase 3 (0187): card_likes.user_id → profile_id.
  SELECT COUNT(*) INTO v_likes_given FROM public.card_likes WHERE profile_id = v_me;
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

-- ── 3-8. get_top_cards_by_likes_inner (card_likes 부분만, cards.author_id 보존) ─
CREATE OR REPLACE FUNCTION public.get_top_cards_by_likes_inner(p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_doctor_id uuid DEFAULT NULL::uuid, p_author_profile_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(card_id bigint, title text, shortcode text, author_id uuid, author_name text, author_handle text, cnt bigint, deleted_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  -- ADR 0014 Phase 3 (0187): card_likes.user_id → profile_id.
  agg AS (
    SELECT l.card_id, COUNT(DISTINCT l.profile_id)::bigint AS c
      FROM public.card_likes l, bounds b
     WHERE l.created_at >= b.since AND l.profile_id IS NOT NULL
     GROUP BY l.card_id
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

-- ── 3-9. get_top_cards_by_saves_inner (card_saves 부분만, cards.author_id 보존) ─
CREATE OR REPLACE FUNCTION public.get_top_cards_by_saves_inner(p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_doctor_id uuid DEFAULT NULL::uuid, p_author_profile_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(card_id bigint, title text, shortcode text, author_id uuid, author_name text, author_handle text, cnt bigint, deleted_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  -- ADR 0014 Phase 3 (0187): card_saves.user_id → profile_id.
  agg AS (
    SELECT s.card_id, COUNT(DISTINCT s.profile_id)::bigint AS c
      FROM public.card_saves s, bounds b
     WHERE s.created_at >= b.since AND s.profile_id IS NOT NULL
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

-- ── 3-10. on_card_like_for_notification (card_likes 트리거 함수) ────────────
-- NEW.user_id 와 본문 COUNT(DISTINCT user_id) FROM card_likes — 두 곳 모두 변경.
CREATE OR REPLACE FUNCTION public.on_card_like_for_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_card_author uuid;
  v_card_short text;
  v_actor_profile uuid;
  v_actor_name text;
  v_existing_id bigint;
  v_total_likers int;
  v_message text;
BEGIN
  SELECT c.author_id, c.shortcode INTO v_card_author, v_card_short
    FROM public.cards c WHERE c.id = NEW.card_id;
  IF v_card_author IS NULL THEN RETURN NEW; END IF;

  -- ADR 0014 Phase 3 (0187): card_likes.user_id → profile_id. NEW.profile_id 사용.
  v_actor_profile := public.auth_uid_to_profile_id(NEW.profile_id);
  IF v_actor_profile = v_card_author THEN RETURN NEW; END IF;
  IF NOT public.is_notification_enabled(v_card_author, 'like') THEN RETURN NEW; END IF;

  SELECT COALESCE(display_name, handle, '회원') INTO v_actor_name
    FROM public.profiles WHERE id = v_actor_profile;

  -- 24h 내 같은 카드 좋아요 누른 고유 사용자 수 (이번 NEW 포함)
  -- ADR 0014 Phase 3: card_likes.user_id → profile_id.
  SELECT count(DISTINCT profile_id) INTO v_total_likers
    FROM public.card_likes
   WHERE card_id = NEW.card_id
     AND created_at >= now() - interval '24 hours';

  IF v_total_likers <= 1 THEN
    v_message := v_actor_name || '님이 좋아합니다';
  ELSE
    v_message := v_actor_name || '님 외 ' || (v_total_likers - 1)::text || '명이 좋아합니다';
  END IF;

  -- 24h 내 기존 알림 있으면 UPDATE, 없으면 INSERT
  SELECT id INTO v_existing_id
    FROM public.notifications
   WHERE recipient_id = v_card_author
     AND card_id = NEW.card_id
     AND kind = 'like'
     AND created_at >= now() - interval '24 hours'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.notifications
       SET message = v_message,
           actor_id = v_actor_profile,
           created_at = now(),
           read_at = NULL
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.notifications
      (recipient_id, kind, actor_id, card_id, message, url)
    VALUES (
      v_card_author,
      'like',
      v_actor_profile,
      NEW.card_id,
      v_message,
      COALESCE(
        (SELECT '/' || p.handle || '/' || v_card_short
           FROM public.profiles p WHERE p.id = v_card_author),
        '/'
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;


-- ============================================================================
-- 4. 트랜잭션 내부 검증 (실패 시 자동 ROLLBACK)
-- ============================================================================
DO $$
DECLARE
  v_missing int;
BEGIN
  -- 4-1. 3 테이블 profile_id 컬럼 존재 + user_id 부재 확인
  SELECT COUNT(*) INTO v_missing
  FROM (VALUES ('card_likes'), ('card_saves'), ('comment_likes')) AS t(tname)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = t.tname AND column_name = 'profile_id'
  );
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Phase 3 verification failed: % tables missing profile_id', v_missing;
  END IF;

  SELECT COUNT(*) INTO v_missing
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('card_likes', 'card_saves', 'comment_likes')
    AND column_name = 'user_id';
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Phase 3 verification failed: legacy user_id column still exists (% rows)', v_missing;
  END IF;

  -- 4-2. RLS 정책 8개 재생성 확인
  SELECT COUNT(*) INTO v_missing
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (tablename = 'card_likes' AND policyname IN ('card_likes_delete', 'card_likes_insert'))
      OR (tablename = 'card_saves' AND policyname IN ('card_saves_delete', 'card_saves_insert', 'card_saves_select'))
      OR (tablename = 'comment_likes' AND policyname IN ('comment_likes_delete', 'comment_likes_insert', 'comment_likes_select'))
    );
  IF v_missing < 8 THEN
    RAISE EXCEPTION 'Phase 3 verification failed: only % of 8 RLS policies recreated', v_missing;
  END IF;

  RAISE NOTICE 'Phase 3 verification passed: 3 tables migrated to profile_id, 8 RLS policies recreated.';
END;
$$;

-- PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

COMMIT;
