-- 0078: trigger 이름 + 함수명 cosmetic rename (qa → card)

BEGIN;

-- trigger 이름 rename
ALTER TRIGGER trg_qa_impressions_inc_count ON public.card_impressions RENAME TO trg_card_impressions_inc_count;
ALTER TRIGGER qa_likes_sync_trigger        ON public.card_likes       RENAME TO card_likes_sync_trigger;
ALTER TRIGGER trg_qa_likes_notification    ON public.card_likes       RENAME TO trg_card_likes_notification;
ALTER TRIGGER trg_qa_ratings_sync          ON public.card_ratings     RENAME TO trg_card_ratings_sync;
ALTER TRIGGER trg_qa_saves_count           ON public.card_saves       RENAME TO trg_card_saves_count;
ALTER TRIGGER trg_qa_views_inc_count       ON public.card_views       RENAME TO trg_card_views_inc_count;
ALTER TRIGGER qas_pick_limit_check         ON public.cards            RENAME TO cards_pick_limit_check;
ALTER TRIGGER qas_set_updated_at           ON public.cards            RENAME TO cards_set_updated_at;
ALTER TRIGGER trg_qa_ask_notification      ON public.cards            RENAME TO trg_card_ask_notification;
ALTER TRIGGER trg_qa_status_notification   ON public.cards            RENAME TO trg_card_status_notification;

-- 함수명 rename
ALTER FUNCTION public.qa_likes_sync()                    RENAME TO card_likes_sync;
ALTER FUNCTION public.qas_rating_sync()                  RENAME TO cards_rating_sync;
ALTER FUNCTION public.qas_save_count_sync()              RENAME TO cards_save_count_sync;
ALTER FUNCTION public.on_qa_impression_insert()          RENAME TO on_card_impression_insert;
ALTER FUNCTION public.on_qa_like_for_notification()      RENAME TO on_card_like_for_notification;
ALTER FUNCTION public.on_qa_view_insert()                RENAME TO on_card_view_insert;
ALTER FUNCTION public.on_qa_ask_for_notification()       RENAME TO on_card_ask_for_notification;
ALTER FUNCTION public.on_qa_status_for_notification()    RENAME TO on_card_status_for_notification;

-- 두 번째 패스: legacy 미사용 RPC 들 (RPC API 호환 깨지지 않음)
ALTER FUNCTION public.increment_qa_like(integer)         RENAME TO increment_card_like;
ALTER FUNCTION public.increment_qa_like(bigint)          RENAME TO increment_card_like;
ALTER FUNCTION public.decrement_qa_like(integer)         RENAME TO decrement_card_like;
ALTER FUNCTION public.decrement_qa_like(bigint)          RENAME TO decrement_card_like;

COMMIT;

SELECT 'OK 0078' AS status;
