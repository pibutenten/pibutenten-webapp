-- 0183. profiles 정비 ④ — is_public 컬럼 DROP + public_profiles_view 재정의
--
-- 배경:
--   - is_public 변경 UI 자체가 없어 44명 전원 NULL 또는 default true. non-true 0건.
--   - 정책상 모든 프로필 공개 전제.
--
-- 의존 객체 처리:
--   - public_profiles_view (0122 마이그, anon/authenticated GRANT) — is_public 컬럼만 빼고 재정의 (CASCADE 금지)
--   - anonymize_user_content_before_delete 함수 — is_public = false 라인 제거 (단독 재정의)
--   - 0122 line 42 의 단독 REVOKE 는 컬럼 자체가 사라지면 자연 무효화
--   - 0123 line 33 anon REVOKE 명단도 동일 (마이그 본문 변경 안 함)
--
-- 처리 순서:
--   (1) anonymize 재정의 → (2) view DROP → (3) 컬럼 DROP → (4) view 재생성 + GRANT
--   3-1 시 view 가 컬럼 참조하면 DROP COLUMN 이 막히므로 view 먼저 drop.

-- (1) anonymize 재정의 — is_public 라인만 제거, 나머지 본문 동일
CREATE OR REPLACE FUNCTION public.anonymize_user_content_before_delete()
RETURNS TABLE(profiles_anonymized integer)
LANGUAGE plpgsql
SECURITY DEFINER
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
    auth_user_id = NULL,
    deleted_at = now(),
    updated_at = now()
  WHERE id = v_target;

  RETURN QUERY SELECT 1;
END;
$$;

-- (2) view DROP
DROP VIEW IF EXISTS public.public_profiles_view;

-- (3) 컬럼 DROP
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_public;

-- (4) view 재생성 — is_public 컬럼만 제외, 나머지 0122 정의 그대로
CREATE VIEW public.public_profiles_view AS
SELECT id, auth_user_id, handle, display_name, avatar_url, bio,
       level, activity_score,
       field_visibility, role, deleted_at, created_at, updated_at
  FROM public.profiles
 WHERE deleted_at IS NULL;

GRANT SELECT ON public.public_profiles_view TO anon, authenticated;

COMMENT ON VIEW public.public_profiles_view IS
  'anon 안전 조회용 — PII 컬럼 제외. 0122 도입, 0183 에서 is_public 컬럼 제외 재정의.';
