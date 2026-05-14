-- 0065: qas → cards 전면 rename
--
-- 변경:
--   1. 테이블 이름:  qas / qa_views / qa_likes / qa_saves / qa_shares / qa_impressions / qa_ratings
--                  → cards / card_views / card_likes / card_saves / card_shares / card_impressions / card_ratings
--   2. 컬럼 이름: 모든 외래키 qa_id → card_id (comments, notifications + 6개 metric 테이블)
--   3. 인덱스 이름 정리
--   4. 임시 backwards-compat VIEW (qas, qa_views, ...) — 옛 RPC/trigger 함수 본문이 즉시 깨지지 않도록.
--      미래 migration 에서 함수 body 재정의 후 view 제거.

BEGIN;

-- ── 1. 테이블 rename
ALTER TABLE public.qas             RENAME TO cards;
ALTER TABLE public.qa_views        RENAME TO card_views;
ALTER TABLE public.qa_likes        RENAME TO card_likes;
ALTER TABLE public.qa_saves        RENAME TO card_saves;
ALTER TABLE public.qa_shares       RENAME TO card_shares;
ALTER TABLE public.qa_impressions  RENAME TO card_impressions;
ALTER TABLE public.qa_ratings      RENAME TO card_ratings;

-- ── 2. 컬럼 rename: qa_id → card_id
ALTER TABLE public.comments         RENAME COLUMN qa_id TO card_id;
ALTER TABLE public.notifications    RENAME COLUMN qa_id TO card_id;
ALTER TABLE public.card_views       RENAME COLUMN qa_id TO card_id;
ALTER TABLE public.card_likes       RENAME COLUMN qa_id TO card_id;
ALTER TABLE public.card_saves       RENAME COLUMN qa_id TO card_id;
ALTER TABLE public.card_shares      RENAME COLUMN qa_id TO card_id;
ALTER TABLE public.card_impressions RENAME COLUMN qa_id TO card_id;
ALTER TABLE public.card_ratings     RENAME COLUMN qa_id TO card_id;

-- ── 3. 인덱스 rename
ALTER INDEX IF EXISTS qa_impressions_pkey                       RENAME TO card_impressions_pkey;
ALTER INDEX IF EXISTS qa_impressions_qa_id_session_id_key       RENAME TO card_impressions_card_id_session_id_key;
ALTER INDEX IF EXISTS qa_likes_pkey                              RENAME TO card_likes_pkey;
ALTER INDEX IF EXISTS qa_likes_qa_idx                            RENAME TO card_likes_card_idx;
ALTER INDEX IF EXISTS qa_likes_user_idx                          RENAME TO card_likes_user_idx;
ALTER INDEX IF EXISTS qa_ratings_pkey                            RENAME TO card_ratings_pkey;
ALTER INDEX IF EXISTS qa_saves_pkey                              RENAME TO card_saves_pkey;
ALTER INDEX IF EXISTS qa_shares_created_at_idx                   RENAME TO card_shares_created_at_idx;
ALTER INDEX IF EXISTS qa_shares_pkey                             RENAME TO card_shares_pkey;
ALTER INDEX IF EXISTS qa_views_created_at_idx                    RENAME TO card_views_created_at_idx;
ALTER INDEX IF EXISTS qa_views_pkey                              RENAME TO card_views_pkey;
ALTER INDEX IF EXISTS qa_views_qa_id_idx                         RENAME TO card_views_card_id_idx;
ALTER INDEX IF EXISTS qas_answer_trgm_idx                        RENAME TO cards_answer_trgm_idx;
ALTER INDEX IF EXISTS qas_article_slug_uidx                      RENAME TO cards_article_slug_uidx;
ALTER INDEX IF EXISTS qas_author_idx                             RENAME TO cards_author_idx;
ALTER INDEX IF EXISTS qas_doctor_idx                             RENAME TO cards_doctor_idx;
ALTER INDEX IF EXISTS qas_keywords_gin_idx                       RENAME TO cards_keywords_gin_idx;
ALTER INDEX IF EXISTS qas_pick_idx                               RENAME TO cards_pick_idx;
ALTER INDEX IF EXISTS qas_pkey                                   RENAME TO cards_pkey;
ALTER INDEX IF EXISTS qas_published_idx                          RENAME TO cards_published_idx;
ALTER INDEX IF EXISTS qas_question_trgm_idx                      RENAME TO cards_question_trgm_idx;
ALTER INDEX IF EXISTS qas_status_idx                             RENAME TO cards_status_idx;
ALTER INDEX IF EXISTS qas_type_doctor_idx                        RENAME TO cards_type_doctor_idx;
ALTER INDEX IF EXISTS qas_type_idx                               RENAME TO cards_type_idx;
ALTER INDEX IF EXISTS qas_video_idx                              RENAME TO cards_video_idx;

-- ── 4. backwards-compat VIEWs — 옛 함수/trigger body 가 즉시 깨지지 않도록 임시 alias.
--      차후 모든 함수 본문이 cards/card_id 직접 사용으로 마이그레이션 완료되면 DROP VIEW 가능.

-- qas: 그대로 (외래키 컬럼 없음)
CREATE OR REPLACE VIEW public.qas AS SELECT * FROM public.cards;

-- 각 테이블의 실제 컬럼 구성에 맞춰 alias.
CREATE OR REPLACE VIEW public.qa_views AS
  SELECT id, card_id AS qa_id, user_id, session_id, created_at
  FROM public.card_views;

CREATE OR REPLACE VIEW public.qa_likes AS
  SELECT user_id, card_id AS qa_id, created_at, persona
  FROM public.card_likes;

CREATE OR REPLACE VIEW public.qa_saves AS
  SELECT card_id AS qa_id, user_id, persona, created_at
  FROM public.card_saves;

CREATE OR REPLACE VIEW public.qa_shares AS
  SELECT id, card_id AS qa_id, user_id, channel, created_at
  FROM public.card_shares;

CREATE OR REPLACE VIEW public.qa_impressions AS
  SELECT id, card_id AS qa_id, user_id, session_id, created_at
  FROM public.card_impressions;

CREATE OR REPLACE VIEW public.qa_ratings AS
  SELECT card_id AS qa_id, user_id, persona, rating, created_at, updated_at
  FROM public.card_ratings;

-- view 권한 (RLS 는 base table 의 정책 상속)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qas TO authenticated;
GRANT SELECT ON public.qas TO anon;
GRANT SELECT, INSERT ON public.qa_views TO anon, authenticated;
GRANT SELECT, INSERT ON public.qa_likes TO authenticated;
GRANT SELECT, INSERT ON public.qa_saves TO authenticated;
GRANT SELECT, INSERT ON public.qa_shares TO anon, authenticated;
GRANT SELECT, INSERT ON public.qa_impressions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.qa_ratings TO authenticated;

COMMIT;

SELECT 'OK 0065' AS status;
