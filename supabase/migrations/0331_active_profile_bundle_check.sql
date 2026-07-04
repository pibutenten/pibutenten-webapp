-- 0331_active_profile_bundle_check.sql
-- Phase 1-A / C-1 (2026-07-04): current_active_profile_id() 헤더 위조 차단.
--
-- 배경: 이 함수는 요청 헤더 x-active-profile-id 를 UUID 형식만 검증하고 그대로
--   반환했다(소유권 검증 없음). COALESCE(current_active_profile_id(), auth.uid())
--   패턴을 쓰는 31개 RLS 정책(cards/comments/diaries/notifications/card_likes/
--   card_saves/comment_likes/push_subscriptions/notification_preferences/
--   diary_procedures/scheduled_notification)이 이 함수에 의존한다. 그 결과 로그인한
--   공격자가 raw REST 요청에 피해자 profile UUID 헤더를 넣으면 소유자 정책이
--   피해자 기준으로 통과 → 타인 시술일기·알림 열람, 타인 명의 댓글·좋아요,
--   타인 글 수정·삭제가 가능했다(수평 권한상승 / IDOR).
--
-- 수정: is_admin()/current_doctor_id() 와 동일한 묶음 소유권 게이트를 추가.
--   헤더 UUID 가 호출자 본인 묶음(id = auth.uid() OR auth_user_id = auth.uid())에
--   속할 때만 반환하고, 아니면 NULL 을 반환한다. NULL 이면 호출측 COALESCE 가
--   auth.uid()(= 본인 base 명함)로 폴백하므로 공격자는 자기 자신으로만 행동 가능.
--   함수 한 곳만 고치면 위 31개 정책이 동시에 안전해진다.
--
-- 안전성: profiles PK(profiles_pkey) + profiles_auth_user_id_idx 로 EXISTS 는 O(1).
--   함수는 STABLE 이라 statement 당 1회로 캐시된다(파라미터 없음). 정상 사용자는
--   base(id=auth.uid) 또는 sub 명함(auth_user_id=auth.uid) 모두 EXISTS 를 통과하므로
--   자기 데이터 접근이 막히지 않는다(실측: base 176 / sub 10 전부 통과).
--
-- 권한: CREATE OR REPLACE 는 기존 GRANT 를 보존한다(0159 의 authenticated/anon
--   EXECUTE 유지). 시그니처 불변이라 재부여 불필요.

CREATE OR REPLACE FUNCTION public.current_active_profile_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_headers json;
  v_active text;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF v_headers IS NULL THEN RETURN NULL; END IF;
  v_active := v_headers ->> 'x-active-profile-id';
  IF v_active IS NULL OR v_active = '' THEN RETURN NULL; END IF;
  -- UUID 형식 검증 (위조 차단 1차).
  IF v_active !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  -- 묶음 소유권 검증 (위조 차단 2차 — is_admin()/current_doctor_id() 와 동일 게이트).
  --   헤더 명함이 호출자 본인 묶음일 때만 반환. 아니면 NULL → 호출측 COALESCE 폴백.
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_active::uuid
      AND (p.id = v_uid OR p.auth_user_id = v_uid)
  ) THEN
    RETURN v_active::uuid;
  END IF;
  RETURN NULL;
END;
$function$;
