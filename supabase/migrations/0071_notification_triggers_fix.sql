-- 0071: 알림 trigger 함수들 컬럼명 + URL 수정
--
-- 두 가지 문제:
--   A. NEW.qa_id → NEW.card_id (0065 컬럼 rename 후 옛 이름 참조로 실패)
--   B. URL 을 '/q/{shortcode}' 로 생성하는데 그 라우트 없음 → '/{handle}/{shortcode}' 로
--      (admin 알림은 /admin/cards/{id}/edit 으로)

-- comments INSERT → comment / reply
CREATE OR REPLACE FUNCTION public.on_comment_for_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_qa_author uuid;
  v_qa_short text;
  v_author_handle text;
  v_actor_profile uuid;
  v_parent_author uuid;
  v_actor_name text;
  v_url text;
BEGIN
  IF NEW.status <> 'visible' THEN RETURN NEW; END IF;

  SELECT c.author_id, c.shortcode, p.handle
    INTO v_qa_author, v_qa_short, v_author_handle
    FROM public.cards c
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE c.id = NEW.card_id;

  v_actor_profile := public.auth_uid_to_profile_id(NEW.author_id);
  SELECT COALESCE(display_name, handle, '회원') INTO v_actor_name
    FROM public.profiles WHERE id = v_actor_profile;

  -- 공개 URL = /{handle}/{shortcode}#c{comment_id}. handle/shortcode 없으면 admin edit 으로
  v_url := CASE
    WHEN v_author_handle IS NOT NULL AND v_qa_short IS NOT NULL
      THEN '/' || v_author_handle || '/' || v_qa_short || '#c' || NEW.id
    ELSE '/admin/cards/' || NEW.card_id::text || '/edit#c' || NEW.id
  END;

  IF NEW.parent_id IS NULL THEN
    IF v_qa_author IS NOT NULL AND v_qa_author <> v_actor_profile
       AND public.is_notification_enabled(v_qa_author, 'comment') THEN
      INSERT INTO public.notifications
        (recipient_id, kind, actor_id, card_id, comment_id, message, url)
      VALUES (
        v_qa_author, 'comment', v_actor_profile, NEW.card_id, NEW.id,
        v_actor_name || '님이 댓글을 남겼습니다',
        v_url
      );
    END IF;
  ELSE
    SELECT public.auth_uid_to_profile_id(c.author_id) INTO v_parent_author
      FROM public.comments c WHERE c.id = NEW.parent_id;
    IF v_parent_author IS NOT NULL AND v_parent_author <> v_actor_profile
       AND public.is_notification_enabled(v_parent_author, 'reply') THEN
      INSERT INTO public.notifications
        (recipient_id, kind, actor_id, card_id, comment_id, message, url)
      VALUES (
        v_parent_author, 'reply', v_actor_profile, NEW.card_id, NEW.id,
        v_actor_name || '님이 답글을 남겼습니다',
        v_url
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- card_likes INSERT → like (24h debounce)
CREATE OR REPLACE FUNCTION public.on_qa_like_for_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_qa_author uuid;
  v_qa_short text;
  v_author_handle text;
  v_actor_profile uuid;
  v_actor_name text;
  v_url text;
BEGIN
  SELECT c.author_id, c.shortcode, p.handle
    INTO v_qa_author, v_qa_short, v_author_handle
    FROM public.cards c
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE c.id = NEW.card_id;
  IF v_qa_author IS NULL THEN RETURN NEW; END IF;

  v_actor_profile := public.auth_uid_to_profile_id(NEW.user_id);
  IF v_actor_profile = v_qa_author THEN RETURN NEW; END IF;
  IF NOT public.is_notification_enabled(v_qa_author, 'like') THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.notifications n
     WHERE n.recipient_id = v_qa_author AND n.card_id = NEW.card_id AND n.kind = 'like'
       AND n.created_at >= now() - interval '24 hours'
  ) THEN RETURN NEW; END IF;

  SELECT COALESCE(display_name, handle, '회원') INTO v_actor_name
    FROM public.profiles WHERE id = v_actor_profile;

  v_url := CASE
    WHEN v_author_handle IS NOT NULL AND v_qa_short IS NOT NULL
      THEN '/' || v_author_handle || '/' || v_qa_short
    ELSE '/admin/cards/' || NEW.card_id::text || '/edit'
  END;

  INSERT INTO public.notifications
    (recipient_id, kind, actor_id, card_id, message, url)
  VALUES (
    v_qa_author, 'like', v_actor_profile, NEW.card_id,
    v_actor_name || '님이 좋아합니다',
    v_url
  );
  RETURN NEW;
END;
$$;

-- cards INSERT (category='ask', published) → 모든 원장에게 'new_ask'
CREATE OR REPLACE FUNCTION public.on_qa_ask_for_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_actor_name text;
  v_author_handle text;
  v_url text;
BEGIN
  IF NEW.category <> 'ask' OR NEW.status <> 'published' THEN RETURN NEW; END IF;
  IF NEW.author_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(display_name, handle, '회원'), handle
    INTO v_actor_name, v_author_handle
    FROM public.profiles WHERE id = NEW.author_id;

  v_url := CASE
    WHEN v_author_handle IS NOT NULL AND NEW.shortcode IS NOT NULL
      THEN '/' || v_author_handle || '/' || NEW.shortcode
    ELSE '/admin/cards/' || NEW.id::text || '/edit'
  END;

  INSERT INTO public.notifications
    (recipient_id, kind, actor_id, card_id, message, url)
  SELECT
    p.id, 'new_ask', NEW.author_id, NEW.id,
    v_actor_name || '님이 궁금해요 글을 올렸습니다',
    v_url
   FROM public.profiles p
  WHERE p.role = 'doctor' AND p.id <> NEW.author_id
    AND public.is_notification_enabled(p.id, 'new_ask');
  RETURN NEW;
END;
$$;

-- cards UPDATE status → review_request / published
CREATE OR REPLACE FUNCTION public.on_qa_status_for_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_doctor_profile uuid;
  v_author_handle text;
  v_url text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  IF NEW.status = 'pending_review' AND NEW.doctor_id IS NOT NULL THEN
    SELECT da.profile_id INTO v_doctor_profile
      FROM public.doctor_accounts da WHERE da.doctor_id = NEW.doctor_id;
    IF v_doctor_profile IS NOT NULL
       AND public.is_notification_enabled(v_doctor_profile, 'review_request') THEN
      INSERT INTO public.notifications
        (recipient_id, kind, card_id, message, url)
      VALUES (
        v_doctor_profile, 'review_request', NEW.id,
        '새 카드 검수 요청이 도착했습니다',
        '/admin/cards/' || NEW.id::text || '/edit'
      );
    END IF;
  END IF;

  IF NEW.status = 'published' AND OLD.status = 'pending_review'
     AND NEW.author_id IS NOT NULL
     AND public.is_notification_enabled(NEW.author_id, 'published') THEN
    SELECT handle INTO v_author_handle FROM public.profiles WHERE id = NEW.author_id;
    v_url := CASE
      WHEN v_author_handle IS NOT NULL AND NEW.shortcode IS NOT NULL
        THEN '/' || v_author_handle || '/' || NEW.shortcode
      ELSE '/admin/cards/' || NEW.id::text || '/edit'
    END;
    INSERT INTO public.notifications
      (recipient_id, kind, card_id, message, url)
    VALUES (
      NEW.author_id, 'published', NEW.id,
      '카드가 발행되었습니다', v_url
    );
  END IF;
  RETURN NEW;
END;
$$;

SELECT 'OK 0071' AS status;
