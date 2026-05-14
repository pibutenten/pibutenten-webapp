-- 0066: card_saves trigger 함수 body 마이그레이션 (NEW.qa_id → NEW.card_id)
-- 그 외 like/rating sync trigger 도 동일 패턴 fix

-- qas_save_count_sync — INSERT/DELETE 시 cards.save_count 동기화
CREATE OR REPLACE FUNCTION public.qas_save_count_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.cards SET save_count = COALESCE(save_count, 0) + 1
     WHERE id = NEW.card_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.cards SET save_count = GREATEST(0, COALESCE(save_count, 0) - 1)
     WHERE id = OLD.card_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- qa_likes_sync — INSERT/DELETE 시 cards.like_count 동기화
CREATE OR REPLACE FUNCTION public.qa_likes_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.cards SET like_count = COALESCE(like_count, 0) + 1
     WHERE id = NEW.card_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.cards SET like_count = GREATEST(0, COALESCE(like_count, 0) - 1)
     WHERE id = OLD.card_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- qas_rating_sync — INSERT/UPDATE/DELETE 시 cards.rating_avg / rating_count 동기화
CREATE OR REPLACE FUNCTION public.qas_rating_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_card_id bigint;
BEGIN
  v_card_id := COALESCE(NEW.card_id, OLD.card_id);
  UPDATE public.cards
     SET rating_count = (SELECT count(*)::int FROM public.card_ratings WHERE card_id = v_card_id),
         rating_avg   = (SELECT COALESCE(avg(rating), 0)::numeric(3,2) FROM public.card_ratings WHERE card_id = v_card_id)
   WHERE id = v_card_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

SELECT 'OK 0066' AS status;
