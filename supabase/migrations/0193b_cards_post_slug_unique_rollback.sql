-- 0193b_cards_post_slug_unique_rollback.sql
-- 0193 롤백: 부분 UNIQUE 인덱스 제거. (일반 인덱스 idx_qas_doctor_year_slug 는 유지)

DROP INDEX IF EXISTS public.cards_doctor_year_slug_uidx;
