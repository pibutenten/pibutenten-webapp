-- 0077: 옛 알림/포인트 trigger DROP — 폐기된 컬럼 (actor_identity_id, identity_id) + 폐기된 enum 값 ('qa_like') 참조해서 INSERT 실패 유발
--
-- 신규 trigger (on_comment_for_notification, on_qa_like_for_notification, on_qa_status_for_notification 등)가 동일 책임 수행 중.

-- card_likes 폐기 trigger
DROP TRIGGER IF EXISTS trg_qa_like_added ON public.card_likes;
DROP FUNCTION IF EXISTS public.on_qa_like_added() CASCADE;

-- comments 폐기 trigger (on_comment_for_notification 가 대체)
DROP TRIGGER IF EXISTS trg_comment_notification ON public.comments;
DROP FUNCTION IF EXISTS public.on_comment_added() CASCADE;

DROP TRIGGER IF EXISTS trg_comment_created ON public.comments;
DROP FUNCTION IF EXISTS public.on_comment_created() CASCADE;

-- on_qa_published — 포인트 시스템 (현재 award_points 함수 사용 안 됨, legacy)
DROP TRIGGER IF EXISTS trg_qa_published ON public.cards;
DROP FUNCTION IF EXISTS public.on_qa_published() CASCADE;

SELECT 'OK 0077' AS status;
