-- 0185_content_reports_status_check.sql
-- CRITICAL-2 (2026-05-29): content_reports.status CHECK constraint 갱신.
--
-- 배경
--   0137 (2026-05-19) 에서 도입된 옛 CHECK 는 5값을 허용:
--     pending / investigating / resolved / rejected / temp_blocked
--   배치 ④ 운영 정의에서 admin/reports/[id] PATCH 라우트가 status 에 다음 3값을
--   SET 하도록 갱신됐으나 (api/admin/reports/[id]/route.ts:134-149):
--     resolved_hidden / resolved_deleted / dismissed
--   DB CHECK 가 동반 갱신되지 않아 첫 신고 처리 시 23514 violation → 500 발생 상태.
--   content_reports 의 row 수 = 0 이라 아직 안 터졌을 뿐.
--
-- 사전 사실 (2026-05-29 production 직접 조회):
--   - status: text NOT NULL DEFAULT 'pending'::text  (NOT NULL/DEFAULT 이미 정합)
--   - 옛 CHECK 정확 정의: CHECK (status IN ('pending','investigating','resolved','rejected','temp_blocked'))
--   - row 수: 0
--   - RPC 0건 / RLS 4개 모두 status 미참조 → DB 안쪽 의존 없음
--   - 코드 INSERT: status='pending' 명시 (현행 CHECK + 신 CHECK 모두 통과)
--   - 코드 UPDATE: 신값 3종만 SET
--
-- 결정 (사전확인 4 기반):
--   1) CHECK 만 단순 교체. NOT NULL/DEFAULT 보정 불필요.
--   2) 신 허용값 4종: pending / resolved_hidden / resolved_deleted / dismissed
--   3) 옛 4값 (investigating/resolved/rejected/temp_blocked) 은 row 0 이라 호환
--      유지 불필요 (코드도 SET 안 함). 미래 옛값 SET 시도는 CHECK 가 차단.
--   4) 단일 트랜잭션. 사전·사후 DO 블록 검증.
--
-- 롤백: 0185b_content_reports_status_check_rollback.sql

BEGIN;

-- ─── 사전 검증 ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_def text;
  v_rows bigint;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.content_reports'::regclass
    AND conname = 'content_reports_status_check';
  IF v_def IS NULL THEN
    RAISE EXCEPTION '[0185 pre] content_reports_status_check 부재 — 이미 갱신됐거나 0137 미적용 상태. 수동 점검 필요.';
  END IF;
  IF v_def NOT ILIKE '%investigating%' THEN
    RAISE EXCEPTION '[0185 pre] 옛 CHECK 정의가 예상과 다름 (investigating 없음): %', v_def;
  END IF;

  SELECT COUNT(*) INTO v_rows FROM public.content_reports;
  IF v_rows <> 0 THEN
    RAISE NOTICE '[0185 pre] content_reports row 수 = % (예상 0). 신 CHECK 와 호환 안 되는 옛값 row 가 있을 수 있음 — 다음 SELECT 로 확인 필요:', v_rows;
    -- 옛값 row 존재 시 INSERT 시점 raise 가 더 명확하므로 여기선 NOTICE 만.
  END IF;

  RAISE NOTICE '[0185 pre] 옛 CHECK 확인 OK / row=%', v_rows;
END $$;

-- ─── 갱신 ──────────────────────────────────────────────────────────────────
ALTER TABLE public.content_reports
  DROP CONSTRAINT IF EXISTS content_reports_status_check;

ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_status_check
  CHECK (status IN ('pending','resolved_hidden','resolved_deleted','dismissed'));

-- ─── 사후 검증 ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.content_reports'::regclass
    AND conname = 'content_reports_status_check';
  IF v_def IS NULL THEN
    RAISE EXCEPTION '[0185 post] content_reports_status_check 신 정의 부재';
  END IF;
  IF v_def ILIKE '%investigating%' THEN
    RAISE EXCEPTION '[0185 post] 옛값 잔재: %', v_def;
  END IF;
  IF v_def NOT ILIKE '%resolved_hidden%'
     OR v_def NOT ILIKE '%resolved_deleted%'
     OR v_def NOT ILIKE '%dismissed%'
     OR v_def NOT ILIKE '%pending%' THEN
    RAISE EXCEPTION '[0185 post] 신 CHECK 에 4값 모두 없음: %', v_def;
  END IF;
  RAISE NOTICE '[0185 post] 신 CHECK OK: %', v_def;
END $$;

-- PostgREST 스키마 캐시 reload (CHECK 변경은 보통 영향 없지만 안전 차원).
NOTIFY pgrst, 'reload schema';

COMMIT;
