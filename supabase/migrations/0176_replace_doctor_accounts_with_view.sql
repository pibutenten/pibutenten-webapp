-- 0176_replace_doctor_accounts_with_view.sql
--
-- 2026-05-28 — doctor_accounts 테이블 안전 폐기 (Phase 1: View 전환). 사용자 결정.
--
-- ── 배경 ───────────────────────────────────────────────────────────────────
-- ADR 0012 (2026-05-26): profiles.doctor_id 가 의사 매핑 SSOT. doctor_accounts 매핑
-- 테이블 직접 조회는 점진 폐기 대상. 응용 코드는 이미 getDoctorIdForProfile 등 헬퍼
-- 통해 profiles.doctor_id 만 조회 (잔재 0 확인 — 2026-05-28 grep).
--
-- 그러나 DB 내부 9개 함수가 여전히 doctor_accounts 를 직접 LEFT JOIN / SELECT / INSERT
-- / DELETE 한다. 모두 profiles.doctor_id 기반으로 재정의.
--
-- ── 본 마이그레이션 행동 ────────────────────────────────────────────────────
-- (1) 9개 함수 재정의 (doctor_accounts → profiles.doctor_id):
--      - current_doctor_id
--      - get_card_activity_users_inner (4개 분기 likes/saves/shares/views)
--      - get_notifications
--      - get_recent_card_likers_batch
--      - get_recent_likers
--      - on_card_status_for_notification (trigger 함수)
--      - propagate_onboarding_to_doctor_bundle
--      - link_doctor_to_profile (INSERT → UPDATE profiles.doctor_id)
--      - unlink_doctor_from_profile (DELETE → UPDATE profiles.doctor_id = NULL)
--
-- (2) ALTER TABLE doctor_accounts RENAME TO doctor_accounts_deprecated
--      - 데이터는 그대로 보존. 향후 audit 또는 정확한 매핑 시점이 필요하면 직접 조회 가능.
--      - 이름이 바뀌어서 신규 코드가 실수로 INSERT/UPDATE/DELETE 못 함 (의도).
--
-- (3) CREATE VIEW doctor_accounts (profiles 기반 — SSOT)
--      - 외부 스크립트·backup pipeline 의 SELECT 호환성 유지.
--      - INSERT/UPDATE/DELETE 는 view 라서 즉시 실패 (의도 — 신규 매핑은 link_doctor_to_profile() 만 사용).
--      - created_at 은 profiles.created_at 으로 대체 (정확한 매핑 시점이 필요하면 deprecated 테이블 조회).
--
-- (4) NOTIFY pgrst 양방향 reload.
--
-- ── 회귀 위협 ─────────────────────────────────────────────────────────────
--   - 응용 코드: 14개 파일이 'doctor_accounts' 텍스트 매칭됐으나 대부분 주석·문서.
--     실제 SELECT 는 getDoctorIdForProfile 등 헬퍼로 캡슐화 → profiles.doctor_id 만 조회.
--     view 가 SELECT 만은 보장하므로 잔재 SELECT 도 안 깨짐.
--   - 외부 스크립트: SELECT 는 view 로 유지. INSERT/UPDATE 는 의도된 실패.
--   - 데이터: RENAME 만, DROP 아님. 원본 보존.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- (1A) current_doctor_id — doctor_accounts JOIN 폐기, profiles.doctor_id 직접 사용
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_doctor_id(uid uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 0176: profiles.doctor_id 인라인 컬럼이 SSOT (ADR 0012). doctor_accounts JOIN 폐기.
  SELECT p.doctor_id
  FROM public.profiles p
  WHERE p.id = COALESCE(public.current_active_profile_id(), uid)
    AND (p.id = uid OR p.auth_user_id = uid)
  LIMIT 1;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- (1B) get_card_activity_users_inner — 4개 분기 모두 doctor_accounts LEFT JOIN 제거
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_card_activity_users_inner(
  p_card_id bigint, p_kind text, p_limit integer DEFAULT 30, p_days integer DEFAULT 0
)
RETURNS TABLE(
  profile_id uuid, display_name text, handle text, avatar_url text,
  acted_at timestamp with time zone
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_since timestamptz := CASE
    WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
    ELSE now() - (p_days || ' days')::interval
  END;
BEGIN
  -- 0176: doctor_accounts LEFT JOIN 제거. profiles.doctor_id 로 doctors 직접 JOIN.
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
    JOIN public.profiles p ON p.id = sh.user_id
    LEFT JOIN public.doctors d ON d.id = p.doctor_id
    WHERE sh.card_id = p_card_id
      AND sh.user_id IS NOT NULL
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
    JOIN public.profiles p ON p.id = v.user_id
    LEFT JOIN public.doctors d ON d.id = p.doctor_id
    WHERE v.card_id = p_card_id
      AND v.user_id IS NOT NULL
      AND v.created_at >= v_since
    ORDER BY p.id, v.created_at DESC
    LIMIT p_limit;

  ELSE
    RETURN;
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- (1C) get_notifications — actor_avatar_url 의 doctor 사진 lookup 정합
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_notifications(
  p_active_profile_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 30
)
RETURNS TABLE(
  id bigint, kind text, card_id bigint, comment_id bigint,
  actor_id uuid, actor_display_name text, actor_avatar_url text, actor_handle text,
  card_title text, url text,
  read_at timestamp with time zone, created_at timestamp with time zone
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH active AS (
    SELECT public.validate_active_profile_id(p_active_profile_id) AS id
  )
  SELECT n.id, n.kind, n.card_id, n.comment_id, n.actor_id,
    p.display_name AS actor_display_name,
    COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS actor_avatar_url,
    p.handle AS actor_handle,
    c.title AS card_title,
    n.url, n.read_at, n.created_at
  FROM public.notifications n
  JOIN active a ON a.id IS NOT NULL AND a.id = n.recipient_id
  LEFT JOIN public.profiles p ON p.id = n.actor_id
  -- 0176: doctor_accounts JOIN 폐기. profiles.doctor_id 로 doctors 직접 JOIN.
  LEFT JOIN public.doctors d ON d.id = p.doctor_id
  LEFT JOIN public.cards c ON c.id = n.card_id
  ORDER BY n.created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- (1D) get_recent_card_likers_batch — 같은 패턴
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_recent_card_likers_batch(
  p_card_ids bigint[], p_limit_per_card integer DEFAULT 3
)
RETURNS TABLE(
  card_id bigint, user_id uuid, display_name text, avatar_url text,
  handle text, created_at timestamp with time zone
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT card_id, user_id, display_name, avatar_url, handle, created_at
  FROM (
    SELECT
      l.card_id,
      l.user_id,
      p.display_name,
      -- 0176: doctor_accounts JOIN 폐기. profiles.doctor_id 로 doctors 직접 JOIN.
      COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
      p.handle,
      l.created_at,
      ROW_NUMBER() OVER (PARTITION BY l.card_id ORDER BY l.created_at DESC) AS rn
    FROM public.card_likes l
    JOIN public.profiles p ON p.id = l.user_id
    LEFT JOIN public.doctors d ON d.id = p.doctor_id
    WHERE l.card_id = ANY(p_card_ids)
  ) ranked
  WHERE rn <= p_limit_per_card
  ORDER BY card_id, created_at DESC;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- (1E) get_recent_likers — 같은 패턴 + 옛 인코딩 깨진 주석 한글 복원
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_recent_likers(
  p_qa_id bigint, p_limit integer DEFAULT 5
)
RETURNS TABLE(
  user_id uuid, persona text, display_name text, avatar_url text,
  handle text, created_at timestamp with time zone
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    l.user_id,
    -- 0176: card_likes.persona 컬럼은 0090 에서 폐기. 옛 함수 정의는 lazy 라 살아있던 잔재.
    --   시그니처 (RETURNS TABLE persona text) 호환 위해 NULL::text 반환.
    NULL::text AS persona,
    p.display_name,
    -- 0176: doctor row 면 doctors.photo_url 우선 (SSOT). doctor_accounts JOIN 폐기.
    COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
    p.handle,
    l.created_at
  FROM public.card_likes l
  JOIN public.profiles p ON p.id = l.user_id
  LEFT JOIN public.doctors d ON d.id = p.doctor_id
  WHERE l.card_id = p_qa_id
  ORDER BY l.created_at DESC
  LIMIT p_limit;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- (1F) on_card_status_for_notification (trigger) — doctor → profile lookup 변경
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_card_status_for_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_doctor_profile uuid;
  v_author_handle text;
  v_url text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  IF NEW.status = 'pending_review' AND NEW.doctor_id IS NOT NULL THEN
    -- 0176: doctor_accounts → profiles.doctor_id (SSOT). 같은 doctor 의 첫 profile 매칭.
    --   ADR 0012 정합: 같은 doctor 에 매핑된 profile 이 여러 개 있을 수 있으나, 알림은
    --   1건만 보냄 (LIMIT 1). 향후 active profile 매칭 정책 변경 시 본 함수 갱신.
    SELECT p.id INTO v_doctor_profile
      FROM public.profiles p
      WHERE p.doctor_id = NEW.doctor_id
      LIMIT 1;
    IF v_doctor_profile IS NOT NULL
       AND public.is_notification_enabled(v_doctor_profile, 'review_request') THEN
      INSERT INTO public.notifications
        (recipient_id, kind, card_id, message, url)
      VALUES (
        v_doctor_profile, 'review_request', NEW.id,
        '새 카드 검수 요청이 도착했습니다',
        '/admin/cards/' || NEW.id::text || '/edit'
      );
    END IF;
  END IF;

  IF NEW.status = 'published' AND OLD.status = 'pending_review'
     AND NEW.author_id IS NOT NULL
     AND public.is_notification_enabled(NEW.author_id, 'published') THEN
    SELECT handle INTO v_author_handle FROM public.profiles WHERE id = NEW.author_id;
    v_url := CASE
      WHEN v_author_handle IS NOT NULL AND NEW.shortcode IS NOT NULL
        THEN '/' || v_author_handle || '/' || NEW.shortcode
      ELSE '/admin/cards/' || NEW.id::text || '/edit'
    END;
    INSERT INTO public.notifications
      (recipient_id, kind, card_id, message, url)
    VALUES (
      NEW.author_id, 'published', NEW.id,
      '카드가 발행되었습니다', v_url
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- (1G) propagate_onboarding_to_doctor_bundle — doctor_accounts EXISTS → profiles.doctor_id
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.propagate_onboarding_to_doctor_bundle(
  p_source_profile_id uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_source_auth_user uuid;
  v_has_doctor boolean;
  v_updated int;
  v_src record;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  SELECT auth_user_id INTO v_source_auth_user FROM profiles WHERE id = p_source_profile_id;
  IF v_source_auth_user IS NULL THEN
    SELECT id INTO v_source_auth_user FROM profiles WHERE id = p_source_profile_id AND id = v_auth;
    IF v_source_auth_user IS NULL THEN RAISE EXCEPTION 'source profile not found'; END IF;
  END IF;
  IF v_source_auth_user != v_auth THEN RAISE EXCEPTION 'not your bundle'; END IF;

  -- 0176: doctor_accounts EXISTS → profiles.doctor_id IS NOT NULL.
  --   "같은 묶음 안에 doctor profile 이 하나라도 있는가" 검사 의미는 동일.
  SELECT EXISTS(
    SELECT 1 FROM profiles
    WHERE id IN (SELECT same_group_profile_ids(v_auth))
      AND doctor_id IS NOT NULL
  ) INTO v_has_doctor;
  IF NOT v_has_doctor THEN RETURN 0; END IF;

  SELECT birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures,
         liked_procedures, bio, terms_agreed_at, marketing_email_consent
  INTO v_src FROM profiles WHERE id = p_source_profile_id;

  UPDATE profiles SET
    birthdate              = COALESCE(profiles.birthdate, v_src.birthdate),
    gender                 = COALESCE(profiles.gender, v_src.gender),
    face_shape             = COALESCE(profiles.face_shape, v_src.face_shape),
    skin_type              = COALESCE(profiles.skin_type, v_src.skin_type),
    skin_concerns          = CASE WHEN profiles.skin_concerns IS NULL OR array_length(profiles.skin_concerns, 1) IS NULL THEN v_src.skin_concerns ELSE profiles.skin_concerns END,
    interested_procedures  = CASE WHEN profiles.interested_procedures IS NULL OR array_length(profiles.interested_procedures, 1) IS NULL THEN v_src.interested_procedures ELSE profiles.interested_procedures END,
    liked_procedures       = CASE WHEN profiles.liked_procedures IS NULL OR array_length(profiles.liked_procedures, 1) IS NULL THEN v_src.liked_procedures ELSE profiles.liked_procedures END,
    bio                    = COALESCE(profiles.bio, v_src.bio),
    terms_agreed_at        = COALESCE(profiles.terms_agreed_at, v_src.terms_agreed_at),
    marketing_email_consent = COALESCE(profiles.marketing_email_consent, v_src.marketing_email_consent)
  WHERE profiles.id IN (SELECT same_group_profile_ids(v_auth))
    AND profiles.id != p_source_profile_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- (1H) link_doctor_to_profile — INSERT INTO doctor_accounts → UPDATE profiles.doctor_id
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_doctor_to_profile(
  p_profile_id uuid, p_doctor_slug text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_doctor_id uuid;
  v_doctor_name text;
  v_identity_id uuid;
  v_caller_role text;
BEGIN
  SELECT role::text INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role <> 'admin' THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT id, name INTO v_doctor_id, v_doctor_name FROM doctors WHERE slug = p_doctor_slug;
  IF v_doctor_id IS NULL THEN
    RAISE EXCEPTION 'doctor slug not found: %', p_doctor_slug;
  END IF;

  -- 0176: doctor_accounts INSERT 폐기. SSOT 인 profiles.doctor_id 를 직접 set.
  --   이미 다른 doctor 매핑이 있는 profile 이면 덮어쓰기 (옛 ON CONFLICT DO NOTHING 과 의미 다름).
  --   admin only 호출이므로 의도적 변경. 옛 매핑 이력이 필요하면 doctor_accounts_deprecated 조회.
  UPDATE profiles SET doctor_id = v_doctor_id WHERE id = p_profile_id;

  -- profile_identities 는 별도 SSOT 가 있으므로 그대로 유지 (옛 의미 보존).
  INSERT INTO profile_identities (profile_id, handle, display_name, kind, doctor_id)
  VALUES (p_profile_id, p_doctor_slug, v_doctor_name, 'doctor', v_doctor_id)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_identity_id;
  IF v_identity_id IS NULL THEN
    SELECT id INTO v_identity_id
      FROM profile_identities
      WHERE profile_id = p_profile_id
        AND kind = 'doctor'
        AND doctor_id = v_doctor_id;
  END IF;
  RETURN v_identity_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- (1I) unlink_doctor_from_profile — DELETE FROM doctor_accounts → SET doctor_id = NULL
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unlink_doctor_from_profile(
  p_profile_id uuid, p_doctor_slug text
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_doctor_id uuid;
  v_caller_role text;
  v_deleted int;
BEGIN
  SELECT role::text INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role <> 'admin' THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT id INTO v_doctor_id FROM doctors WHERE slug = p_doctor_slug;

  -- 0176: doctor_accounts DELETE 폐기. SSOT 인 profiles.doctor_id 를 NULL 로.
  --   해당 doctor 와 매핑된 profile 만 해제 (다른 doctor 매핑은 보존). 옛과 의미 동일.
  UPDATE profiles SET doctor_id = NULL
    WHERE id = p_profile_id AND doctor_id = v_doctor_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM profile_identities
    WHERE profile_id = p_profile_id
      AND kind = 'doctor'
      AND doctor_id = v_doctor_id;
  RETURN v_deleted;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- (2) 테이블 RENAME — 데이터 보존 (DROP 아님)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.doctor_accounts RENAME TO doctor_accounts_deprecated;

-- 옛 이름의 인덱스·시퀀스도 자동 함께 rename 됨. 명시 추가 안 함.
COMMENT ON TABLE public.doctor_accounts_deprecated IS
  '0176 (2026-05-28) 폐기 — SSOT 는 profiles.doctor_id. 매핑 시점 created_at 만 audit 용 보존. 신규 매핑 INSERT 금지 (link_doctor_to_profile RPC 사용).';

-- ─────────────────────────────────────────────────────────────────────────────
-- (3) View — 외부 SELECT 호환성 유지 (profiles 기반, SSOT 강제)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.doctor_accounts AS
SELECT
  p.id AS profile_id,
  p.doctor_id,
  p.created_at  -- 0176: 매핑 시점 아닌 profile 생성일. 정확한 매핑 시점이 필요하면 doctor_accounts_deprecated 직접 조회.
FROM public.profiles p
WHERE p.doctor_id IS NOT NULL;

COMMENT ON VIEW public.doctor_accounts IS
  '0176 (2026-05-28) 호환성 view — 외부 스크립트·backup pipeline SELECT 호환용. SSOT 는 profiles.doctor_id. INSERT/UPDATE/DELETE 는 view 라 실패 (의도). 신규 매핑은 link_doctor_to_profile RPC 사용.';

-- view 도 authenticated 가 읽을 수 있도록 (옛 테이블과 같은 권한)
GRANT SELECT ON public.doctor_accounts TO authenticated;
GRANT SELECT ON public.doctor_accounts TO anon;

COMMIT;

-- PostgREST 스키마 캐시 양방향 강제 reload.
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
