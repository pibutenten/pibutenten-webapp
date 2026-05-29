-- 0189b_rollback.sql
-- 0189 의 정확한 역방향 — 비상 시 사용.
--
-- 0189 가 컬럼을 DROP 했으므로 단순히 ADD COLUMN 하면 NULL 로 복원됨.
-- 옛 데이터 복원이 필요하면 B-1 백업 테이블 public.profiles_backup_20260529 에서
-- 추출하여 UPDATE.

BEGIN;

-- 1. 컬럼 부재 시에만 ADD (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'age_confirmed_at'
  ) THEN
    RAISE NOTICE 'age_confirmed_at already present — skip ADD.';
    RETURN;
  END IF;

  ALTER TABLE public.profiles ADD COLUMN age_confirmed_at timestamptz;
  RAISE NOTICE 'age_confirmed_at column re-added (NULL).';
END;
$$;

-- 2. (옵션) 옛 데이터 복원 — B-1 백업에서 추출
--    수동 실행 시 주석 해제. 자동 실행하지 않음 (백업 테이블 존재 가정 + 무차별 덮어쓰기 위험).
--
-- UPDATE public.profiles p SET
--   age_confirmed_at = b.age_confirmed_at
-- FROM public.profiles_backup_20260529 b
-- WHERE b.id = p.id
--   AND b.age_confirmed_at IS NOT NULL;

-- 3. 컬럼 단위 GRANT 재설정 (0123 마이그 호환)
GRANT SELECT (age_confirmed_at) ON public.profiles TO anon;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 운영 노트:
-- 1) 본 rollback 은 컬럼을 NULL 로 재생성. 옛 timestamp 보존이 필요하면 §2 수동 실행.
-- 2) signup/SignupForm.tsx 의 age_confirmed_at: now() 라인도 코드 측에서 함께
--    복원해야 함 — git revert 권장.
-- 3) 본 작업 적용 전후로 production 사용자 흐름에 직접 영향 없음 (SET-only 컬럼이라
--    READ 가 없어 회귀 표면 0).
