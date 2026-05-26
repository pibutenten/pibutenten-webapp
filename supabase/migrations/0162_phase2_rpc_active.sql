-- 0162: Phase 2-B — RPC 일괄 계정 단위 정합 (2026-05-26)
--
-- ADR 0001 + ADR 0011 원칙 정합 (사용자 확정 정책 "모두 계정별 독립"):
--   소프트 삭제 / 숨김 토글 / 좋아요·저장·댓글좋아요 토글 / 알림 read /
--   내 통계 / doctor KPI / Pick 토글 / 탈퇴 익명화 모두 계정(active profile) 단위.
--
-- 새 함수:
--   - toggle_card_hide(p_card_id, p_next_status): admin EditClient [숨기기] 의 RPC 통일
--
-- 본문 교체 (active 단위 + 위조 차단):
--   - soft_delete_card: same_group_profile_ids → COALESCE(active, uid) 단일 비교
--   - get_my_stats: auth_user_id 직접 비교 → 계정 단위 (Phase 9 깨짐 fix + active)
--   - mark_my_notifications_read / get_my_notifications: 묶음 me CTE → 단일 active id
--   - toggle_card_like / toggle_card_save / toggle_comment_like: NULL 분기를 active fallback
--   - toggle_card_pick: self-doctor 검증을 current_doctor_id() (active 인식) 로
--   - _check_doctor_kpi_access / get_doctor_kpi: 동일
--   - anonymize_user_content_before_delete: 묶음 전체 → active 계정 1개만 익명화

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. toggle_card_hide — admin/owner 의 숨김/공개 토글 (RPC 통일)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_card_hide(p_card_id bigint, p_next_status text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_active uuid;
  v_card record;
  v_can boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_next_status NOT IN ('hidden','published') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  v_active := COALESCE(public.current_active_profile_id(), v_uid);

  SELECT id, author_id, doctor_id, status INTO v_card
    FROM public.cards WHERE id = p_card_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'card_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- 권한: admin OR active profile 이 카드 author OR active profile 이 카드 doctor
  IF public.is_admin(v_uid) THEN
    v_can := true;
  ELSIF v_card.author_id IS NOT NULL AND v_card.author_id = v_active THEN
    v_can := true;
  ELSIF v_card.doctor_id IS NOT NULL AND v_card.doctor_id = public.current_doctor_id(v_uid) THEN
    v_can := true;
  END IF;

  IF NOT v_can THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.cards SET status = p_next_status::qa_status, updated_at = now()
    WHERE id = p_card_id;

  RETURN jsonb_build_object('ok', true, 'card_id', p_card_id, 'status', p_next_status);
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_card_hide(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_card_hide(bigint, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 2. soft_delete_card — same_group → active 단위
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.soft_delete_card(p_card_id bigint)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_active uuid;
  v_card record;
  v_can boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  v_active := COALESCE(public.current_active_profile_id(), v_uid);

  SELECT id, author_id, doctor_id, deleted_at INTO v_card
    FROM public.cards WHERE id = p_card_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'card_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_card.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'card_id', v_card.id, 'already_deleted', true);
  END IF;

  -- 권한: admin / active 가 author / active 가 doctor 매핑
  IF public.is_admin(v_uid) THEN
    v_can := true;
  ELSIF v_card.author_id IS NOT NULL AND v_card.author_id = v_active THEN
    v_can := true;
  ELSIF v_card.doctor_id IS NOT NULL AND v_card.doctor_id = public.current_doctor_id(v_uid) THEN
    v_can := true;
  END IF;

  IF NOT v_can THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.cards SET deleted_at = now() WHERE id = p_card_id;
  RETURN jsonb_build_object('ok', true, 'card_id', v_card.id);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. get_my_stats — Phase 9 깨짐 fix (author_id = auth.uid() → active profile.id)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_stats()
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
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

  v_check := v_today;
  LOOP
    EXIT WHEN NOT EXISTS(SELECT 1 FROM public.daily_logins WHERE user_id = v_me AND login_date = v_check);
    v_streak := v_streak + 1;
    v_check := v_check - 1;
  END LOOP;

  SELECT COALESCE(SUM(points), 0)::int INTO v_score
  FROM public.activity_points WHERE user_id = v_me AND created_at > now() - interval '90 days';
  v_level := CASE WHEN v_score >= 2000 THEN 3 WHEN v_score >= 500 THEN 2 WHEN v_score >= 100 THEN 1 ELSE 0 END;

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
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. get_my_notifications — me CTE 묶음 → active 단일 id
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit integer DEFAULT 20)
  RETURNS TABLE(id bigint, kind text, actor_id uuid, actor_name text, actor_handle text,
                card_id bigint, comment_id bigint, message text, url text,
                read_at timestamp with time zone, created_at timestamp with time zone)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT n.id, n.kind, n.actor_id, p.display_name AS actor_name,
         p.handle AS actor_handle, n.card_id, n.comment_id,
         n.message, n.url, n.read_at, n.created_at
    FROM public.notifications n
    LEFT JOIN public.profiles p ON p.id = n.actor_id
   WHERE n.recipient_id = COALESCE(public.current_active_profile_id(), auth.uid())
   ORDER BY n.created_at DESC
   LIMIT p_limit;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. mark_my_notifications_read — me CTE 묶음 → active 단일 id
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_my_notifications_read()
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  UPDATE public.notifications n
     SET read_at = now()
   WHERE n.recipient_id = COALESCE(public.current_active_profile_id(), auth.uid())
     AND n.read_at IS NULL
     AND NOT (
       n.kind = 'comment'
       AND n.created_at >= now() - interval '24 hours'
       AND EXISTS (
         SELECT 1 FROM public.cards c
          WHERE c.id = n.card_id
            AND c.author_id = COALESCE(public.current_active_profile_id(), auth.uid())
            AND c.category = 'ask'
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.comments c2
          WHERE c2.card_id = n.card_id
            AND c2.status = 'visible'
            AND c2.author_id = COALESCE(public.current_active_profile_id(), auth.uid())
       )
     );
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. toggle_card_like / toggle_card_save / toggle_comment_like — active fallback
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_card_like(p_card_id integer, p_identity_id uuid DEFAULT NULL::uuid)
  RETURNS TABLE(liked boolean, like_count integer)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
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

CREATE OR REPLACE FUNCTION public.toggle_card_save(p_card_id bigint, p_identity_id uuid DEFAULT NULL::uuid)
  RETURNS TABLE(saved boolean, save_count integer)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
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

CREATE OR REPLACE FUNCTION public.toggle_comment_like(p_comment_id bigint, p_identity_id uuid DEFAULT NULL::uuid)
  RETURNS TABLE(liked boolean, like_count integer)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
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

  IF EXISTS (SELECT 1 FROM public.comment_likes WHERE comment_id = p_comment_id AND user_id = v_target) THEN
    DELETE FROM public.comment_likes WHERE comment_id = p_comment_id AND user_id = v_target;
    SELECT c.like_count INTO v_count FROM public.comments c WHERE c.id = p_comment_id;
    RETURN QUERY SELECT false, v_count;
  ELSE
    INSERT INTO public.comment_likes (comment_id, user_id) VALUES (p_comment_id, v_target);
    SELECT c.like_count INTO v_count FROM public.comments c WHERE c.id = p_comment_id;
    RETURN QUERY SELECT true, v_count;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. toggle_card_pick — current_doctor_id() 활용 (active 인식)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_card_pick(p_card_id integer, p_pick boolean)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_card_doctor_id uuid;
BEGIN
  IF public.is_admin() THEN
    UPDATE public.cards SET is_pick = p_pick WHERE id = p_card_id;
    RETURN p_pick;
  END IF;

  -- self-doctor: 카드의 doctor_id 가 active doctor 와 동일해야
  SELECT doctor_id INTO v_card_doctor_id FROM public.cards WHERE id = p_card_id;
  IF v_card_doctor_id IS NULL OR v_card_doctor_id <> public.current_doctor_id() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.cards SET is_pick = p_pick WHERE id = p_card_id;
  RETURN p_pick;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 8. _check_doctor_kpi_access / get_doctor_kpi — current_doctor_id() 활용
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._check_doctor_kpi_access(p_doctor_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT public.is_admin() OR (public.current_doctor_id() = p_doctor_id);
$$;

CREATE OR REPLACE FUNCTION public.get_doctor_kpi(p_doctor_id uuid, p_profile_id uuid, p_days integer DEFAULT 7)
  RETURNS TABLE(views_received bigint, comments_received bigint, saves_received bigint,
                shares_received bigint, published_total bigint, pending_review bigint)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.get_doctor_kpi_inner(p_doctor_id, p_profile_id, p_days);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 9. anonymize_user_content_before_delete — 계정 단위 1개만 익명화
--    (사용자 정책: 모두 계정별 독립. 묶음 일괄 익명화 X)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.anonymize_user_content_before_delete()
  RETURNS TABLE(profiles_anonymized integer)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid;
  v_mask text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;
  v_target := COALESCE(public.current_active_profile_id(), v_uid);

  -- 위조 차단: target 이 호출자 묶음에 속하는지 검증
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_target AND (p.id = v_uid OR p.auth_user_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_mask := 'deleted-' || substring(replace(v_target::text, '-', ''), 1, 12);
  UPDATE public.profiles
  SET
    handle = v_mask,
    display_name = '(탈퇴한 사용자)',
    avatar_url = NULL,
    bio = NULL,
    contact_email = NULL,
    birthdate = NULL,
    gender = NULL,
    face_shape = NULL,
    skin_type = NULL,
    skin_concerns = '{}'::text[],
    interested_procedures = '{}'::text[],
    liked_procedures = '{}'::text[],
    field_visibility = '{}'::jsonb,
    marketing_email_consent = false,
    is_public = false,
    auth_user_id = NULL,
    deleted_at = now(),
    updated_at = now()
  WHERE id = v_target;

  RETURN QUERY SELECT 1;
END;
$$;

-- 검증: 함수 본문
SELECT proname, prosecdef
FROM pg_proc
WHERE proname IN ('toggle_card_hide','soft_delete_card','get_my_stats',
                  'get_my_notifications','mark_my_notifications_read',
                  'toggle_card_like','toggle_card_save','toggle_comment_like',
                  'toggle_card_pick','_check_doctor_kpi_access','get_doctor_kpi',
                  'anonymize_user_content_before_delete')
ORDER BY proname;

COMMIT;
