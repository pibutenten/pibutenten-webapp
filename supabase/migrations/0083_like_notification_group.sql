-- 0083: 좋아요 알림 N명 그룹화
--
-- 기존: 24시간 내 같은 (recipient, card_id, kind='like') 알림 있으면 SKIP → 1건만 보냄
-- 변경: SKIP 대신 기존 row UPDATE — message + actor_id + created_at + read_at 재설정
--       사용자에게 "OOO님 외 N명이 좋아합니다" 형식으로 누적 좋아요 노출, 다시 unread 상태로 인지 유도.

CREATE OR REPLACE FUNCTION public.on_card_like_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_card_author uuid;
  v_card_short text;
  v_actor_profile uuid;
  v_actor_name text;
  v_existing_id bigint;
  v_total_likers int;
  v_message text;
BEGIN
  SELECT c.author_id, c.shortcode INTO v_card_author, v_card_short
    FROM public.cards c WHERE c.id = NEW.card_id;
  IF v_card_author IS NULL THEN RETURN NEW; END IF;

  v_actor_profile := public.auth_uid_to_profile_id(NEW.user_id);
  IF v_actor_profile = v_card_author THEN RETURN NEW; END IF;
  IF NOT public.is_notification_enabled(v_card_author, 'like') THEN RETURN NEW; END IF;

  SELECT COALESCE(display_name, handle, '회원') INTO v_actor_name
    FROM public.profiles WHERE id = v_actor_profile;

  -- 24h 내 같은 카드 좋아요 누른 고유 사용자 수 (이번 NEW 포함)
  SELECT count(DISTINCT user_id) INTO v_total_likers
    FROM public.card_likes
   WHERE card_id = NEW.card_id
     AND created_at >= now() - interval '24 hours';

  IF v_total_likers <= 1 THEN
    v_message := v_actor_name || '님이 좋아합니다';
  ELSE
    v_message := v_actor_name || '님 외 ' || (v_total_likers - 1)::text || '명이 좋아합니다';
  END IF;

  -- 24h 내 기존 알림 있으면 UPDATE, 없으면 INSERT
  SELECT id INTO v_existing_id
    FROM public.notifications
   WHERE recipient_id = v_card_author
     AND card_id = NEW.card_id
     AND kind = 'like'
     AND created_at >= now() - interval '24 hours'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.notifications
       SET message = v_message,
           actor_id = v_actor_profile,
           created_at = now(),
           read_at = NULL
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.notifications
      (recipient_id, kind, actor_id, card_id, message, url)
    VALUES (
      v_card_author,
      'like',
      v_actor_profile,
      NEW.card_id,
      v_message,
      COALESCE(
        (SELECT '/' || p.handle || '/' || v_card_short
           FROM public.profiles p WHERE p.id = v_card_author),
        '/'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

SELECT 'OK 0083' AS status;
