-- 0047: qa_views INSERT 시 qas.view_count 자동 동기화 trigger
-- 목적: 두 메트릭(qas.view_count + qa_views 테이블) 항상 일치.
--   기존: recordView()에서 RPC + INSERT 둘 다 호출 → 둘 중 하나 실패 시 불일치
--   변경: recordView()는 qa_views.insert만 → trigger가 view_count +1 자동 보장

CREATE OR REPLACE FUNCTION public.on_qa_view_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE qas
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = NEW.qa_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qa_views_inc_count ON public.qa_views;

CREATE TRIGGER trg_qa_views_inc_count
AFTER INSERT ON public.qa_views
FOR EACH ROW
EXECUTE FUNCTION public.on_qa_view_insert();
