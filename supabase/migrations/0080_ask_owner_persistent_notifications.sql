-- 0080: '궁금해요' 알림 24h 지속 정책
--
-- 정책:
--   '궁금해요'(ask) 글에 누군가 댓글을 달면 작성자에게 'comment' 알림 생성 (기존 동일).
--   그 알림은 작성자가 본인 카드에 직접 답글을 달기 전까지는 24시간 동안 unread 유지.
--   종 클릭/페이지 진입 자동 모두 읽음에서 이 알림은 제외 (사용자가 직접 행동해야 정리됨).
--   본인이 답글을 다는 순간 자동 read 처리됨 (B1 trigger).
--
-- 절대적 24h 만료 cron 없음 — SNS 표준 방식 (트위터/인스타 등):
--   본인 행동으로 정리되거나, 그냥 unread로 남음.
--   "24h 이내"는 mark_read 제외 조건일 뿐.

-- ─────────────────────────────────────────────────────────────
-- B1. trigger: ask 글 작성자가 본인 카드에 visible comment 작성 시
--     그 카드의 unread 'comment' 알림 자동 read 처리
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_ask_owner_self_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_card_author uuid;
  v_card_category text;
  v_author_profile uuid;
BEGIN
  IF NEW.status <> 'visible' THEN RETURN NEW; END IF;

  SELECT c.author_id, c.category INTO v_card_author, v_card_category
    FROM public.cards c WHERE c.id = NEW.card_id;
  IF v_card_author IS NULL OR v_card_category <> 'ask' THEN
    RETURN NEW;
  END IF;

  -- 댓글 작성자(NEW.author_id = auth.users.id) → profiles.id
  v_author_profile := public.auth_uid_to_profile_id(NEW.author_id);
  IF v_author_profile IS NULL THEN RETURN NEW; END IF;

  -- 카드 작성자 본인이 단 댓글일 때만 자동 read 처리
  IF v_author_profile <> v_card_author THEN
    RETURN NEW;
  END IF;

  -- 그 카드의 unread 'comment' 알림 → read 처리
  UPDATE public.notifications
     SET read_at = now()
   WHERE recipient_id = v_card_author
     AND card_id = NEW.card_id
     AND kind = 'comment'
     AND read_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ask_owner_self_reply ON public.comments;
CREATE TRIGGER trg_ask_owner_self_reply
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.on_ask_owner_self_reply();

-- ─────────────────────────────────────────────────────────────
-- B2. mark_my_notifications_read() 갱신
--     ask 본인 미답 + 24h 이내 comment 알림은 자동 read 제외
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_my_notifications_read()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH me AS (
    SELECT id FROM public.profiles
     WHERE id = auth.uid() OR auth_user_id = auth.uid()
  )
  UPDATE public.notifications n
     SET read_at = now()
    FROM me
   WHERE n.recipient_id = me.id
     AND n.read_at IS NULL
     -- 다음 조건의 알림은 자동 read 제외:
     --   본인 'ask' 카드에 달린 'comment' 알림 + 24h 이내 + 본인이 아직 답글 안 단 상태
     AND NOT (
       n.kind = 'comment'
       AND n.created_at >= now() - interval '24 hours'
       AND EXISTS (
         SELECT 1 FROM public.cards c
          WHERE c.id = n.card_id
            AND c.author_id = me.id
            AND c.category = 'ask'
       )
       AND NOT EXISTS (
         -- 작성자(me.id 묶음)가 그 카드에 visible 댓글을 단 적이 없는 경우
         SELECT 1 FROM public.comments c2
          JOIN public.profiles pp
            ON pp.id = me.id
          WHERE c2.card_id = n.card_id
            AND c2.status = 'visible'
            AND (c2.author_id = pp.id OR c2.author_id = pp.auth_user_id)
       )
     );
$$;

GRANT EXECUTE ON FUNCTION public.mark_my_notifications_read() TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- B3. mark_notifications_read(p_ids bigint[]) 갱신
--     동일 정책: p_ids = NULL(일괄)인 경우 ask 본인 미답 + 24h 이내 알림 제외.
--     p_ids 명시 시는 사용자가 명시적 read 요청이므로 그대로 처리.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids bigint[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
  v_me uuid;
BEGIN
  -- Phase 9 묶음 인지 — profile.id 또는 auth_user_id 매칭 한 행 우선
  SELECT id INTO v_me
    FROM public.profiles
   WHERE id = auth.uid() OR auth_user_id = auth.uid()
   LIMIT 1;

  IF p_ids IS NULL THEN
    UPDATE public.notifications n
       SET read_at = now()
     WHERE n.recipient_id = v_me
       AND n.read_at IS NULL
       AND NOT (
         n.kind = 'comment'
         AND n.created_at >= now() - interval '24 hours'
         AND EXISTS (
           SELECT 1 FROM public.cards c
            WHERE c.id = n.card_id
              AND c.author_id = v_me
              AND c.category = 'ask'
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.comments c2, public.profiles pp
            WHERE pp.id = v_me
              AND c2.card_id = n.card_id
              AND c2.status = 'visible'
              AND (c2.author_id = pp.id OR c2.author_id = pp.auth_user_id)
         )
       );
  ELSE
    -- 명시적 ID 지정 — 사용자가 직접 행동(특정 알림 읽음 처리)이므로 제외 없음
    UPDATE public.notifications
       SET read_at = now()
     WHERE recipient_id = v_me
       AND id = ANY(p_ids)
       AND read_at IS NULL;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notifications_read(bigint[]) TO authenticated;

SELECT 'OK 0080' AS status;
