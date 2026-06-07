-- 0270. clinics 신규 테이블 — 건강보험심사평가원 병원정보 참조 테이블
--
-- 목적: 피부일기 작성 시 시술받은 병원을 검색·선택하기 위한 참조 데이터.
--   관리자 운영 페이지 "병원 정보 가져오기" 메뉴에서 service_role 로 upsert.
--   공공데이터포털 건강보험심사평가원 병원정보서비스 API 응답을 주기적으로 동기화.
--   주 대상: 피부과 의원 (clCdNm 기준 필터링은 애플리케이션 레이어에서 처리).
-- RLS: anon/authenticated SELECT 허용(공개 검색용), 쓰기는 service_role 전용.
-- 트리거: updated_at 자동 갱신 — public.set_updated_at() 재사용 (0001_init.sql 정의).
-- 인덱스:
--   - name btree           : prefix 검색 (/api/clinics?q=서울피부)
--   - name GIN + pg_trgm   : 한글 중간 검색 ('부산피부' LIKE '%부산피부%')
--   - (sido_cd, sgu_cd)    : 지역 필터링
--   - (x_pos, y_pos)       : 위치 기반 주변 병원 조회
-- 주의: 기존 테이블·데이터 변경 없음. additive·순수 신규.

-- pg_trgm 확장 (한글 GIN 인덱스 필수, 멱등)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 1. 테이블 생성 ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clinics (
  id          bigserial PRIMARY KEY,
  ykiho       text       UNIQUE NOT NULL,  -- 심평원 요양기호 (upsert 기준 고유키)
  name        text       NOT NULL,         -- 병원명 (yadmNm)
  addr        text,                        -- 주소
  tel         text,                        -- 전화번호
  url         text,                        -- 홈페이지
  sido_cd     text,                        -- 시도코드
  sgu_cd      text,                        -- 시군구코드
  x_pos       double precision,            -- 경도 (XPos)
  y_pos       double precision,            -- 위도 (YPos)
  clinic_type text,                        -- 종별명 (clCdNm, 예: 의원/병원)
  raw         jsonb,                       -- 원본 API 응답 보존
  synced_at   timestamptz DEFAULT now(),   -- 마지막 동기화 시각
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ── 2. 인덱스 ───────────────────────────────────────────────────────────────
-- 병원명 btree: prefix 검색 (LIKE '서울피부%', 대소문자 무관 한글 기준 정렬용)
CREATE INDEX IF NOT EXISTS clinics_name_btree
  ON public.clinics (name);

-- 병원명 GIN (pg_trgm): 한글 중간 부분검색 (LIKE '%부산피부%')
CREATE INDEX IF NOT EXISTS clinics_name_trgm
  ON public.clinics USING GIN (name gin_trgm_ops);

-- 지역 복합 인덱스: 시도+시군구 필터링
CREATE INDEX IF NOT EXISTS clinics_sido_sgu
  ON public.clinics (sido_cd, sgu_cd);

-- 위치 인덱스: 위경도 기반 주변 병원 조회
CREATE INDEX IF NOT EXISTS clinics_xy
  ON public.clinics (x_pos, y_pos);

-- ── 3. updated_at 자동 갱신 트리거 ─────────────────────────────────────────
-- public.set_updated_at() 는 0001_init.sql 에서 정의된 공용 함수를 재사용
DROP TRIGGER IF EXISTS clinics_set_updated_at ON public.clinics;
CREATE TRIGGER clinics_set_updated_at
  BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. RLS 활성화 ───────────────────────────────────────────────────────────
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

-- 4-1. anon/authenticated SELECT 허용 (공개 병원 검색용 — PII 없음)
CREATE POLICY "clinics_select_public"
  ON public.clinics
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 4-2. INSERT — service_role 전용 (관리자 sync only, 일반 사용자 차단)
--   service_role 은 RLS 를 bypass 하므로 별도 policy 불필요.
--   authenticated INSERT 를 막기 위해 INSERT policy 를 생략하면
--   RLS 기본 동작(no matching policy → deny)으로 자동 차단됨.
--   명시적 확인용 주석: UPDATE / DELETE 도 동일하게 policy 미정의 = 차단.

-- ── 5. GRANT (PostgREST REST 접근용) ────────────────────────────────────────
-- SELECT 는 RLS policy 로 허용했으나 테이블 수준 GRANT 도 필요 (0249 패턴과 동일)
GRANT SELECT ON public.clinics TO anon, authenticated;
-- service_role 은 superuser 수준으로 별도 GRANT 불필요

