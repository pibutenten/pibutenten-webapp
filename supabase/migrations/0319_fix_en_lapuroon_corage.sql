-- 0319_fix_en_lapuroon_corage.sql
-- 목적: 0318 에서 임시 음역한 신규 시술 영문 slug 2건을 웹 검색 확정값으로 교정합니다.
--   라풀렌 → lapuroon (Lapuroon, PDRN 스킨부스터/EXOCOBIO)
--   코레지 → corage  (Corage Cellfit, QMR/Telea 콜라겐 리프팅)
-- (이브시너지=eve-synergy, 프랙타트=fractat 는 검색 결과 정확하여 유지)
BEGIN;
UPDATE public.tag_dictionary SET en = 'lapuroon' WHERE ko = '라풀렌';
UPDATE public.tag_dictionary SET en = 'corage'   WHERE ko = '코레지';
COMMIT;
