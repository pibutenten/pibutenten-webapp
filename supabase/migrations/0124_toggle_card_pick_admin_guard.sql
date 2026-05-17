-- 0124: toggle_card_pick 에 admin 가드 추가 (A4 sweep 후속, 2026-05-17)
--
-- 배경:
--   0119 적용 후 pg_proc 전수 sweep 결과, `toggle_card_pick` 이 SECURITY DEFINER +
--   GRANT EXECUTE TO authenticated 조합이면서 본문에 admin 가드 없음 발견.
--   일반 로그인 사용자가 PostgREST 로 호출 시 임의 카드의 is_pick 을 조작 가능.
--
-- 조치: 본문 도입부에 `IF NOT public.is_admin() THEN RAISE EXCEPTION` 추가.
--      함수 본문이 짧아 wrapper 패턴 대신 직접 재정의.

BEGIN;

CREATE OR REPLACE FUNCTION public.toggle_card_pick(
  p_card_id integer,
  p_pick boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.cards SET is_pick = p_pick WHERE id = p_card_id;
  RETURN p_pick;
END;
$$;

COMMIT;
