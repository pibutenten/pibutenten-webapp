-- 0116_rename_keyword_marionette.sql
--
-- 기존 카드 keywords 배열의 "마리오네트주름" → "마리오네트라인" 일괄 교체.
-- 결정: 표준 표기 통일 (2026-05-17).
--
-- 안전성:
--   - array_replace 는 멱등 (재실행해도 안전)
--   - 영향 row 만 UPDATE (WHERE 절로 한정)
--
-- 회귀 위험: 낮음. UI 에서 키워드는 표시·검색용. URL 영향 없음 (slug 는 별도 컬럼).

UPDATE public.cards
SET keywords = array_replace(keywords, '마리오네트주름', '마리오네트라인')
WHERE '마리오네트주름' = ANY(keywords);

-- pubmed_refs 의 ko 키워드도 동일 정리 (있는 경우)
-- (pubmed_refs 는 jsonb 라 array_replace 안 됨 — 별도 함수 필요. 일단 keywords 만 처리.
--  필요 시 후속 마이그레이션으로 pubmed_refs 정리)
