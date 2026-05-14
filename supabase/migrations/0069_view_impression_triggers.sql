-- 0069: view/impression trigger 함수 본문 NEW.qa_id → NEW.card_id 수정
-- 0065 컬럼 rename 후 trigger 함수가 옛 컬럼명 참조 → INSERT 시 에러로 이벤트 0건 누적

CREATE OR REPLACE FUNCTION public.on_qa_view_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.cards
     SET view_count = COALESCE(view_count, 0) + 1
   WHERE id = NEW.card_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_qa_impression_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.cards
     SET impression_count = COALESCE(impression_count, 0) + 1
   WHERE id = NEW.card_id;
  RETURN NEW;
END;
$$;

SELECT 'OK 0069' AS status;
