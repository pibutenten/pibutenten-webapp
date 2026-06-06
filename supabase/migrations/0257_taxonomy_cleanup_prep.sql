-- 0257. procedure_taxonomy 청산 준비 (C-Phase2 STEP 1) — 백업 + tag_dictionary.sort_order
--
-- 배경: 시술 분류 SSOT 를 procedure_taxonomy → tag_dictionary(is_procedure=true) 로 단일화.
--   시술 49개는 양 테이블에 동일 ko 로 중복(both 49). procedure_taxonomy 고유 컬럼은
--   sort_order(후기 폼 시술 나열 순서)·active(전부 true) → sort_order 만 tag_dictionary 로 이관,
--   active 는 폐기(is_procedure=true 로 대체).
-- 본 마이그는 비파괴(백업 + 컬럼 추가 + 값 복사)만. FK 재지정·DROP 은 후속(0259).
--
-- 백업: procedure_taxonomy 전수 + procedure_reviews(id, procedure_ko) — 롤백 안전망.

CREATE TABLE IF NOT EXISTS public.procedure_taxonomy_bak_0257 AS
  SELECT *, now() AS backed_up_at FROM public.procedure_taxonomy;

CREATE TABLE IF NOT EXISTS public.procedure_reviews_ko_bak_0257 AS
  SELECT id, procedure_ko, now() AS backed_up_at FROM public.procedure_reviews;

-- tag_dictionary.sort_order (시술 후기 폼 나열 순서 보존). 비시술은 NULL.
ALTER TABLE public.tag_dictionary ADD COLUMN IF NOT EXISTS sort_order integer;

UPDATE public.tag_dictionary td
SET sort_order = pt.sort_order
FROM public.procedure_taxonomy pt
WHERE td.ko = pt.ko AND td.is_procedure;
