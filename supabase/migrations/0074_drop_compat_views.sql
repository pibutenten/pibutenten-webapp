-- 0074: backwards-compat VIEW 제거
--
-- 0072 / 0073 / migrate_remaining_functions.py 로 모든 함수 본문이 cards/card_* 직접 참조로 마이그레이션됨.
-- 이제 compat view 들은 사용처 없음 → DROP.

DROP VIEW IF EXISTS public.qas;
DROP VIEW IF EXISTS public.qa_views;
DROP VIEW IF EXISTS public.qa_likes;
DROP VIEW IF EXISTS public.qa_saves;
DROP VIEW IF EXISTS public.qa_shares;
DROP VIEW IF EXISTS public.qa_impressions;
DROP VIEW IF EXISTS public.qa_ratings;

SELECT 'OK 0074' AS status;
