-- 0165: profiles.doctor_id 컬럼 인라인 (ADR 0012 정합 Phase 1)
--
-- 사용자 결정 (2026-05-26): "의사 아이디면 의사인 것. 별도 매핑 표 불필요. 명함 row
-- 안에 의사 정보가 박혀 있으면 됨."
--
-- 이 마이그레이션은 **단방향 비파괴**:
--   1. profiles 에 doctor_id 컬럼 추가 (nullable)
--   2. doctor_accounts 에서 백필
--   3. doctor_accounts INSERT/UPDATE/DELETE 시 profiles.doctor_id 자동 sync 트리거
--      (호출 측 9~18곳이 헬퍼로 migrate 되기 전 정합 유지)
--
-- doctor_accounts 표 자체 DROP 은 **본 마이그레이션에 포함하지 않음**.
--   - CLAUDE.md §10 (파괴적 DB 변경 자동 실행 금지)
--   - 호출 측 9~18곳 코드 정합 후 별도 마이그레이션 (0167+) 으로 사용자 직접 실행
--
-- 적용:
--   curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
--     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--     -H "Content-Type: application/json" \
--     -d @0165_profiles_inline_doctor_id.sql

BEGIN;

-- 1) 컬럼 추가 (nullable)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_doctor_id
  ON public.profiles(doctor_id)
  WHERE doctor_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.doctor_id IS
  'ADR 0012 — 의사 명함의 의사 정보 인라인. NULL = 회원 명함. doctor_accounts 표는 점진 폐기.';

-- 2) 백필 (doctor_accounts 에서 복사)
UPDATE public.profiles p
   SET doctor_id = da.doctor_id
  FROM public.doctor_accounts da
 WHERE da.profile_id = p.id
   AND p.doctor_id IS NULL;

-- 3) doctor_accounts 변경 시 profiles.doctor_id 자동 sync 트리거.
--   호출 측 코드가 아직 doctor_accounts 를 직접 update 하는 동안 정합 유지.
CREATE OR REPLACE FUNCTION public._sync_profile_doctor_id() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET doctor_id = NEW.doctor_id WHERE id = NEW.profile_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
      UPDATE public.profiles SET doctor_id = NULL WHERE id = OLD.profile_id;
    END IF;
    UPDATE public.profiles SET doctor_id = NEW.doctor_id WHERE id = NEW.profile_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET doctor_id = NULL WHERE id = OLD.profile_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_doctor_id ON public.doctor_accounts;
CREATE TRIGGER trg_sync_profile_doctor_id
  AFTER INSERT OR UPDATE OR DELETE ON public.doctor_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public._sync_profile_doctor_id();

-- 4) get_active_doctor_id() 함수 본문 — profiles.doctor_id 우선 사용 (단순화)
CREATE OR REPLACE FUNCTION public.get_active_doctor_id(p_profile_id uuid)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT doctor_id FROM public.profiles WHERE id = p_profile_id
$$;

COMMENT ON FUNCTION public.get_active_doctor_id(uuid) IS
  'ADR 0012 — profiles.doctor_id 인라인 컬럼 직접 조회. doctor_accounts SELECT 우회.';

COMMIT;
