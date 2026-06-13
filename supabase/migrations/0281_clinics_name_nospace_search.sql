-- 0281. clinics 병원명 공백 무시 검색 지원
--
-- 배경: clinics.name 에는 공백 포함 병원명이 393행 존재(예: "서울 365 mc 의원").
--   현재 ilike('%검색어%') 방식은 사용자가 공백 없이 입력하면 매칭 실패.
--   반대로 DB에 공백이 없는데 사용자가 공백 넣어도 실패. 양방향 공백 무시가 목표.
--
-- 방식: STORED generated column name_nospace 추가
--   + GIN(pg_trgm) 인덱스 추가 → ilike('%공백제거검색어%') 가 인덱스 경유 가능.
--   클라이언트는 검색어에서 공백 제거 후 ilike("name_nospace", ...) 로 조회.
--   결과 컬럼은 기존과 동일(name, addr, tel, x_pos, y_pos) — 클라이언트 매핑 변경 불필요.
--
-- 비파괴: 컬럼 추가 + 인덱스 생성만. DROP/TRUNCATE/DELETE 없음.
-- pg_trgm: 이미 설치(1.6). clinics_name_trgm 인덱스도 기존 존재.

-- 1) 공백 제거 STORED generated column 추가
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS name_nospace text
    GENERATED ALWAYS AS (regexp_replace(name, '\s', '', 'g')) STORED;

-- 2) name_nospace 에 GIN(pg_trgm) 인덱스 추가 — ilike('%...%') 를 인덱스 경유하게 함
CREATE INDEX IF NOT EXISTS clinics_name_nospace_trgm
  ON public.clinics
  USING gin (name_nospace gin_trgm_ops);

-- 3) name_nospace 컬럼에 대한 anon/authenticated SELECT 권한 확인 (테이블 단위 정책 상속)
--    RLS 정책 clinics_select_public(anon,authenticated,SELECT,true) 가 이미 존재하므로
--    별도 GRANT 불필요. service_role 도 0272 에서 전체 DML 부여됨.

-- 검증 쿼리 (적용 후 수동 확인용)
-- SELECT name, name_nospace
--   FROM clinics
--  WHERE name LIKE '% %'
--  LIMIT 5;
--
-- SELECT name FROM clinics
--  WHERE name_nospace ILIKE '%서울365mc%'
--  LIMIT 5;
