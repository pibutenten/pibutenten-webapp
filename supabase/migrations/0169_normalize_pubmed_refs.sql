-- 0169_normalize_pubmed_refs.sql
--
-- pubmed_refs (jsonb[]) 안 각 객체의 데이터 형식을 SSOT (PubmedRefSchema) 와 정합 정규화.
--
-- 원칙 (Critical-4):
--   1) year 는 문자열이 아니라 정수 (number | null).
--   2) 비어있는 doi_url 은 "" 가 아니라 null.
--   3) 모든 참고문헌 타입은 src/lib/schema/api/articles.ts 의 PubmedRefSchema 단일 출처.
--
-- production 현황 (조사 결과 2026-05-27):
--   - 858 refs 모두 year = string (예: "2024")
--   - 64 refs 의 doi_url = "" (빈 문자열)
--   - 8 refs 는 doi_url 필드 자체 없음 (보존)
--   - 2 refs 는 doi_url = null (이미 정합, 보존)
--
-- 정규화 규칙:
--   - year 가 string + 정수 패턴 ("2024") → int 로 변환
--   - year 가 string 인데 정수가 아닌 값 → null 처리 (변환 불가능 → null)
--   - year 가 number / null / 부재 → 그대로 보존
--   - doi_url = "" → null 로 설정 (필드 제거가 아니라 명시 null — 클라이언트 호환)
--   - 다른 모든 필드 (pmid, doi, title, journal, authors_short, pubmed_url) 는 그대로 보존
--
-- 안전성:
--   - 헬퍼 함수 _normalize_pubmed_ref_v0169 를 public schema 에 임시 생성하고 사용 종료 후 DROP.
--   - UPDATE 1회로 끝나며, 같은 row 재실행해도 idempotent (이미 int 면 그대로).
--   - pubmed_refs IS NULL 인 row 는 손대지 않음 (대다수 카드).

-- ─────────────────────────────────────────────────────────────
-- 1. 임시 헬퍼: 단일 ref jsonb → 정규화된 jsonb
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._normalize_pubmed_ref_v0169(ref jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  out jsonb := ref;
  y_text text;
BEGIN
  -- ref 자체가 null 또는 jsonb null 이면 그대로 반환
  IF ref IS NULL OR ref = 'null'::jsonb THEN
    RETURN ref;
  END IF;

  -- 1) year 정규화
  IF jsonb_typeof(ref->'year') = 'string' THEN
    y_text := ref->>'year';
    IF y_text ~ '^-?[0-9]+$' THEN
      -- 정수 패턴 → int 로 변환
      out := jsonb_set(out, '{year}', to_jsonb(y_text::int));
    ELSE
      -- 정수 아닌 string → null
      out := jsonb_set(out, '{year}', 'null'::jsonb);
    END IF;
  END IF;
  -- year 가 number / null / 부재 → 그대로 (out 미수정)

  -- 2) doi_url 빈 문자열 → null
  IF out->>'doi_url' = '' THEN
    out := jsonb_set(out, '{doi_url}', 'null'::jsonb);
  END IF;

  RETURN out;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. cards.pubmed_refs 전수 정규화
-- ─────────────────────────────────────────────────────────────
UPDATE public.cards
SET pubmed_refs = (
  SELECT array_agg(public._normalize_pubmed_ref_v0169(ref))
  FROM unnest(pubmed_refs) AS ref
)
WHERE pubmed_refs IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. 임시 헬퍼 제거
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION public._normalize_pubmed_ref_v0169(jsonb);

SELECT 'OK 0169' AS status;
