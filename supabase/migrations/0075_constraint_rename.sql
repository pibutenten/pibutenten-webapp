-- 0075: FK 제약명 + index 잔여 + enum 'article' 정리
--
-- A. FK 제약명 qas_*_fkey / qa_*_qa_id_fkey → cards_*_fkey / card_*_card_id_fkey
-- B. enum qa_type 의 'article' 값 물리 제거 (RLS policy DROP/CREATE 동반)

BEGIN;

-- A. FK constraint rename
ALTER TABLE public.cards RENAME CONSTRAINT qas_author_id_profiles_fkey TO cards_author_id_profiles_fkey;
ALTER TABLE public.cards RENAME CONSTRAINT qas_doctor_id_fkey TO cards_doctor_id_fkey;
ALTER TABLE public.cards RENAME CONSTRAINT qas_video_id_fkey TO cards_video_id_fkey;
ALTER TABLE public.cards RENAME CONSTRAINT qas_category_check TO cards_category_check;
ALTER TABLE public.cards RENAME CONSTRAINT qas_shortcode_format TO cards_shortcode_format;

ALTER TABLE public.card_likes RENAME CONSTRAINT qa_likes_qa_id_fkey TO card_likes_card_id_fkey;
ALTER TABLE public.card_saves RENAME CONSTRAINT qa_saves_qa_id_fkey TO card_saves_card_id_fkey;
ALTER TABLE public.card_views RENAME CONSTRAINT qa_views_qa_id_fkey TO card_views_card_id_fkey;
ALTER TABLE public.card_shares RENAME CONSTRAINT qa_shares_qa_id_fkey TO card_shares_card_id_fkey;
ALTER TABLE public.card_impressions RENAME CONSTRAINT qa_impressions_qa_id_fkey TO card_impressions_card_id_fkey;
ALTER TABLE public.card_impressions RENAME CONSTRAINT qa_impressions_user_id_fkey TO card_impressions_user_id_fkey;
ALTER TABLE public.card_ratings RENAME CONSTRAINT qa_ratings_qa_id_fkey TO card_ratings_card_id_fkey;
ALTER TABLE public.card_ratings RENAME CONSTRAINT qa_ratings_rating_check TO card_ratings_rating_check;

ALTER TABLE public.comments RENAME CONSTRAINT comments_qa_id_fkey TO comments_card_id_fkey;
ALTER TABLE public.notifications RENAME CONSTRAINT notifications_qa_id_fkey TO notifications_card_id_fkey;

-- B. qa_type enum 'article' 물리 제거
-- 의존하는 RLS policy 전부 DROP → enum 교체 → policy 재생성. 위험 → 보류.
-- 별도 phase 로 분리 (RLS 분석 + 안전 마이그레이션 필요).

COMMIT;

SELECT 'OK 0075' AS status;
