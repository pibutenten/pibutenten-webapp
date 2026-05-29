-- 0189_drop_age_confirmed_at.sql
-- B-5 (2026-05-29): dead 컬럼 age_confirmed_at DROP.
--
-- 사전 조사 (B-5):
--   - src/ 코드 READ 0건 (SET 1건: signup/SignupForm.tsx:53 — 본 마이그와 같은 commit 에서 제거)
--   - DB 본문 RPC 등장 0건 / RLS 등장 0건 / 트리거 등장 0건 / 인덱스 0건 / 제약 0건 / view 0건
--   - 데이터 분포: NOT NULL 36 / NULL 10 / total 46 — DROP 시 36 row 의 timestamp 손실
--     단 어디서도 READ 안 함 (단순 SET-only). 만 14세 차단은 birthdate 로 OnboardingClient
--     가 재계산하므로 별도 timestamp 보존 불필요.
--
-- 백업: public.profiles_backup_20260529 (B-1 에서 생성) 에 옛 age_confirmed_at 컬럼이
--      그대로 보존됨. 복원 필요 시 그쪽에서 추출.
--
-- 단일 트랜잭션. 검증 블록 포함.

BEGIN;

-- 1. 컬럼 존재 확인 (idempotent — 두 번 적용 시 안전)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'age_confirmed_at'
  ) THEN
    RAISE NOTICE 'age_confirmed_at column already absent — skip DROP.';
    RETURN;
  END IF;

  -- 2. 컬럼 DROP (관련 GRANT 자동 정리. 다른 의존성 없음 — 사전 조사 0건)
  ALTER TABLE public.profiles DROP COLUMN age_confirmed_at;

  RAISE NOTICE 'age_confirmed_at column dropped from public.profiles';
END;
$$;

-- 3. 사후 검증: 컬럼 부재 확인
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'age_confirmed_at'
  ) THEN
    RAISE EXCEPTION 'Phase B-5 verification failed: age_confirmed_at still present';
  END IF;
END;
$$;

-- PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

COMMIT;
