-- 0210: 시술 분류에 '더엘주사' 추가 (스킨부스터/injectables) — 후기 작성 대상에 포함
--
-- 사용자 요청: 스킨부스터에 '더엘주사' 시술 태그를 만들어 후기를 남길 수 있게 한다.
-- 정식 시술(parent_ko NULL)로 injectables 카테고리에 추가. sort_order 는 기존 최대값+1.
INSERT INTO public.procedure_taxonomy (ko, en, category, parent_ko, sort_order, active)
SELECT '더엘주사', 'the-l-injection', 'injectables', NULL,
       COALESCE(MAX(sort_order), 0) + 1, true
FROM public.procedure_taxonomy
WHERE category = 'injectables'
ON CONFLICT DO NOTHING;
